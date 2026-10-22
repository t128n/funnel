/**
 * Filter + search evaluation for the local issue streams (SPEC §9.4).
 *
 * Seven multi-select dimensions (Repo, State, Status, Assignee, Priority, Size,
 * Labels) combine as **OR within a group, AND across groups**, plus a plain SQL
 * `LIKE` search over titles, bodies, and comments (FTS5 is deferred; INTERVIEW
 * Q16/Q17).
 *
 * Parsing is pure over an injected {@link IssueFilterContext} so it is
 * unit-testable without a database; {@link buildIssueWhere} turns the parsed
 * filter into a Drizzle `WHERE` clause evaluated against the mirror.
 */
import {
  and,
  eq,
  exists,
  inArray,
  isNull,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";
import { db } from "#lib/server/db/index";
import {
  mirrorComment,
  mirrorThread,
  mirrorThreadAssignee,
  mirrorThreadLabel,
  mirrorUser,
} from "#lib/server/db/schema";
import { CANONICAL_LABELS, type LabelGroup } from "#lib/server/github/labels";
import { isRetiredPriorityLabel } from "#lib/priority";

/** Canonical status label names; absence means "untriaged" (Inbox). */
export const STATUS_VALUES = [
  "backlog",
  "todo",
  "in-progress",
  "in-review",
] as const;
/**
 * Priority filter vocabulary. The URL uses the lowercase form; the durable
 * cache stores the canonical `P1`–`P3` value.
 */
export const PRIORITY_VALUES = ["p1", "p2", "p3"] as const;
export const SIZE_VALUES = ["sm", "md", "lg"] as const;

/** GitHub issue states. The Issues view defaults to `open` (SPEC §9.2). */
export const STATE_VALUES = ["open", "closed"] as const;

export type StatusValue = (typeof STATUS_VALUES)[number];
export type PriorityValue = (typeof PRIORITY_VALUES)[number];
export type SizeValue = (typeof SIZE_VALUES)[number];
export type StateValue = (typeof STATE_VALUES)[number];

/** Sentinel selecting items missing the label for a dimension. */
export const NONE = "none";

/** Canonical label name (lowercase) -> its reserved group. */
export const RESERVED_GROUP = new Map<string, LabelGroup>(
  CANONICAL_LABELS.map((label) => [label.name.toLowerCase(), label.group]),
);

const STATUS_SET = new Set<string>(STATUS_VALUES);
const PRIORITY_SET = new Set<string>(PRIORITY_VALUES);
const SIZE_SET = new Set<string>(SIZE_VALUES);
const STATE_SET = new Set<string>(STATE_VALUES);

/** A milestone selection resolved to the repo it belongs to. */
export interface MilestoneFilterRef {
  repoId: number;
  number: number;
}

/** Parsed, validated filter state. Empty arrays mean "no constraint". */
export interface IssueFilter {
  /** Internal `mirror_repo.id` values. */
  repos: number[];
  /** `open` and/or `closed`; absence means "all states". */
  states: string[];
  /** Canonical status names and/or {@link NONE}. */
  statuses: string[];
  /** Forge-native `mirror_user.external_id` values. */
  assignees: string[];
  /** `p1`-`p3` and/or {@link NONE}. */
  priorities: string[];
  /** `sm`/`md`/`lg` and/or {@link NONE}. */
  sizes: string[];
  /** Non-reserved label names (reserved names belong to their dimension). */
  labels: string[];
  /** Repo-scoped milestone selections, resolved against the mirrored repos. */
  milestones: MilestoneFilterRef[];
  /** The {@link NONE} sentinel: unmilestoned issues. */
  noMilestone: boolean;
  /** Raw `LIKE` search term (may be empty). */
  search: string;
}

/** Everything parsing needs from the surrounding request. */
export interface IssueFilterContext {
  /** Every mirrored repo, for `owner/name` -> internal id resolution. */
  repos: ReadonlyArray<{ id: number; org: string; name: string }>;
  /** The signed-in viewer's forge-native id (`assignee=me`). */
  viewerExternalId?: string | null;
  /** Login -> external id resolver (case-insensitive) for assignee names. */
  resolveLogin?: (login: string) => string | undefined;
}

export const EMPTY_FILTER: IssueFilter = {
  repos: [],
  states: [],
  statuses: [],
  assignees: [],
  priorities: [],
  sizes: [],
  labels: [],
  milestones: [],
  noMilestone: false,
  search: "",
};

/**
 * Collect a (possibly repeated, possibly comma-joined) query parameter into a
 * de-duplicated, trimmed list. `?status=todo&status=blocked` and
 * `?status=todo,blocked` are equivalent.
 */
function multi(params: URLSearchParams, key: string): string[] {
  const out: string[] = [];
  for (const raw of params.getAll(key)) {
    for (const part of raw.split(",")) {
      const value = part.trim();
      if (value.length > 0 && !out.includes(value)) out.push(value);
    }
  }
  return out;
}

/** Keep only values present in `allowed` (plus the `none` sentinel). */
function vocab(values: readonly string[], allowed: Set<string>): string[] {
  const out: string[] = [];
  for (const value of values) {
    const lower = value.toLowerCase();
    if (allowed.has(lower) && !out.includes(lower)) out.push(lower);
    else if (lower === NONE && !out.includes(NONE)) out.push(NONE);
  }
  return out;
}

/** Map `owner/name` (case-insensitive) to a mirrored repo id. */
function resolveRepos(
  values: readonly string[],
  repos: IssueFilterContext["repos"],
): number[] {
  const out: number[] = [];
  for (const value of values) {
    const slash = value.indexOf("/");
    if (slash <= 0 || slash === value.length - 1) continue;
    const org = value.slice(0, slash).toLowerCase();
    const name = value.slice(slash + 1).toLowerCase();
    const match = repos.find(
      (repo) => repo.org.toLowerCase() === org && repo.name.toLowerCase() === name,
    );
    if (match && !out.includes(match.id)) out.push(match.id);
  }
  return out;
}

function resolveAssignees(
  values: readonly string[],
  ctx: IssueFilterContext,
): string[] {
  const out: string[] = [];
  const push = (id: string | undefined) => {
    if (id !== undefined && id.length > 0 && !out.includes(id)) out.push(id);
  };
  for (const value of values) {
    if (value.toLowerCase() === "me") {
      push(ctx.viewerExternalId ?? undefined);
      continue;
    }
    if (/^\d+$/.test(value)) {
      push(value);
      continue;
    }
    push(ctx.resolveLogin?.(value));
  }
  return out;
}

/**
 * Parse the milestone dimension. Values are repo-scoped slugs
 * (`owner/name#number`); the {@link NONE} sentinel selects unmilestoned issues.
 * Unknown repos or malformed numbers are dropped silently.
 */
function resolveMilestones(
  values: readonly string[],
  repos: IssueFilterContext["repos"],
): { refs: MilestoneFilterRef[]; none: boolean } {
  const refs: MilestoneFilterRef[] = [];
  let none = false;
  for (const value of values) {
    if (value.toLowerCase() === NONE) {
      none = true;
      continue;
    }
    const hash = value.lastIndexOf("#");
    if (hash <= 0 || hash === value.length - 1) continue;
    const slug = value.slice(0, hash);
    const number = Number(value.slice(hash + 1));
    if (!Number.isInteger(number) || number <= 0) continue;
    const slash = slug.indexOf("/");
    if (slash <= 0 || slash === slug.length - 1) continue;
    const org = slug.slice(0, slash).toLowerCase();
    const name = slug.slice(slash + 1).toLowerCase();
    const match = repos.find(
      (repo) => repo.org.toLowerCase() === org && repo.name.toLowerCase() === name,
    );
    if (match) refs.push({ repoId: match.id, number });
  }
  return { refs, none };
}

/**
 * Parse URL query parameters into a validated {@link IssueFilter}. Unknown
 * params and unparseable values are dropped silently, mirroring GitHub.
 */
export function parseIssueFilter(
  params: URLSearchParams,
  ctx: IssueFilterContext,
): IssueFilter {
  const milestones = resolveMilestones(multi(params, "milestone"), ctx.repos);
  return {
    repos: resolveRepos(multi(params, "repo"), ctx.repos),
    states: vocab(multi(params, "state"), STATE_SET).filter(
      (value) => value !== NONE,
    ),
    statuses: vocab(multi(params, "status"), STATUS_SET),
    assignees: resolveAssignees(multi(params, "assignee"), ctx),
    priorities: vocab(multi(params, "priority"), PRIORITY_SET),
    sizes: vocab(multi(params, "size"), SIZE_SET),
    labels: multi(params, "label").filter(
      (name) =>
        !RESERVED_GROUP.has(name.toLowerCase()) &&
        !isRetiredPriorityLabel(name),
    ),
    milestones: milestones.refs,
    noMilestone: milestones.none,
    search: (params.get("q") ?? "").trim().slice(0, 200),
  };
}

/** Escape `LIKE` metacharacters so a search term is matched literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/**
 * `EXISTS` clause for "assigned to any of these forge users" (OR within
 * group). Assignee identity is the forge-native external id, so the junction
 * row joins `mirror_user` on the internal id.
 */
export function assigneeExists(externalIds: readonly string[]): SQL {
  return exists(
    db
      .select({ one: sql`1` })
      .from(mirrorThreadAssignee)
      .innerJoin(mirrorUser, eq(mirrorThreadAssignee.userId, mirrorUser.id))
      .where(
        and(
          eq(mirrorThreadAssignee.repoId, mirrorThread.repoId),
          eq(mirrorThreadAssignee.threadNumber, mirrorThread.number),
          inArray(mirrorUser.externalId, [...externalIds]),
        ),
      ),
  );
}

/** `EXISTS` clause for "carries any of these labels" (OR within group). */
function labelExists(names: readonly string[]): SQL {
  return exists(
    db
      .select({ one: sql`1` })
      .from(mirrorThreadLabel)
      .where(
        and(
          eq(mirrorThreadLabel.repoId, mirrorThread.repoId),
          eq(mirrorThreadLabel.threadNumber, mirrorThread.number),
          inArray(mirrorThreadLabel.labelName, [...names]),
        ),
      ),
  );
}

/** One dimension: OR of equality plus an optional "is null" for `none`. */
function dimension(column: AnyColumn, values: readonly string[]): SQL | undefined {
  if (values.length === 0) return undefined;
  const parts = values
    .filter((value) => value !== NONE)
    .map((value) => eq(column, value));
  if (values.includes(NONE)) parts.push(isNull(column));
  if (parts.length === 0) return undefined;
  return parts.length === 1 ? parts[0] : or(...parts);
}

/**
 * Build the Drizzle `WHERE` for a filter, or `undefined` when unconstrained.
 * Each populated dimension is ANDed; values inside a dimension OR together.
 */
export function buildIssueWhere(filter: IssueFilter): SQL | undefined {
  const conditions: SQL[] = [];

  if (filter.repos.length > 0) {
    conditions.push(inArray(mirrorThread.repoId, filter.repos));
  }

  for (const [column, values] of [
    [mirrorThread.state, filter.states],
    [mirrorThread.status, filter.statuses],
    [mirrorThread.size, filter.sizes],
  ] as const) {
    const clause = dimension(column, values);
    if (clause) conditions.push(clause);
  }

  // Priority is the derived P1–P3 cache; the URL uses the lowercase form.
  if (filter.priorities.length > 0) {
    const parts = filter.priorities
      .filter((value) => value !== NONE)
      .map((value) => eq(mirrorThread.priority, value.toUpperCase()));
    if (filter.priorities.includes(NONE)) {
      parts.push(isNull(mirrorThread.priority));
    }
    if (parts.length === 1) conditions.push(parts[0]);
    else if (parts.length > 1) conditions.push(or(...parts) as SQL);
  }

  if (filter.assignees.length > 0) {
    conditions.push(assigneeExists(filter.assignees));
  }
  if (filter.labels.length > 0) {
    conditions.push(labelExists(filter.labels));
  }

  if (filter.milestones.length > 0 || filter.noMilestone) {
    const parts: SQL[] = filter.milestones.map(
      (m) =>
        and(
          eq(mirrorThread.repoId, m.repoId),
          eq(mirrorThread.milestoneNumber, m.number),
        ) as SQL,
    );
    if (filter.noMilestone) {
      parts.push(isNull(mirrorThread.milestoneNumber) as SQL);
    }
    conditions.push(parts.length === 1 ? parts[0] : (or(...parts) as SQL));
  }

  if (filter.search.length > 0) {
    const pattern = `%${escapeLike(filter.search)}%`;
    const like = (column: unknown) =>
      sql`${column} LIKE ${pattern} ESCAPE '\\'`;
    conditions.push(
      or(
        like(mirrorThread.title),
        like(mirrorThread.body),
        exists(
          db
            .select({ one: sql`1` })
            .from(mirrorComment)
            .where(
              and(
                eq(mirrorComment.repoId, mirrorThread.repoId),
                eq(mirrorComment.threadNumber, mirrorThread.number),
                like(mirrorComment.body),
              ),
            ),
        ),
      ) as SQL,
    );
  }

  if (conditions.length === 0) return undefined;
  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

/** Reserved-group membership of a label name, if any. */
export function groupOf(label: string): LabelGroup | undefined {
  return RESERVED_GROUP.get(label.toLowerCase());
}
