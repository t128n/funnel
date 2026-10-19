/**
 * Filter + search evaluation for the local issue streams (SPEC §9.4).
 *
 * Seven multi-select dimensions (Repo, State, Status, Assignee, Priority, Size,
 * Labels) combine as **OR within a group, AND across groups**, plus a plain SQL
 * `LIKE` search over titles, bodies, and comments (FTS5 is deferred; INTERVIEW
 * Q16/Q17).
 *
 * Parsing is pure over an injected {@link FilterContext} so it is unit-testable
 * without a database; {@link buildIssueWhere} turns the parsed filter into a
 * Drizzle `WHERE` clause evaluated against the mirror.
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
  mirrorGithubComment,
  mirrorGithubIssue,
  mirrorGithubIssueAssignee,
  mirrorGithubIssueLabel,
} from "#lib/server/db/schema";
import { CANONICAL_LABELS, type LabelGroup } from "#lib/server/github/labels";

/** Canonical status label names; absence means "untriaged" (Inbox). */
export const STATUS_VALUES = [
  "backlog",
  "todo",
  "in-progress",
  "in-review",
] as const;
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
  /** `mirror_github_repo.github_id` values. */
  repos: number[];
  /** `open` and/or `closed`; absence means "all states". */
  states: string[];
  /** Canonical status names and/or {@link NONE}. */
  statuses: string[];
  /** `mirror_github_user.github_id` values. */
  assignees: number[];
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
export interface FilterContext {
  /** Every mirrored repo, for `owner/name` -> id resolution. */
  repos: ReadonlyArray<{ githubId: number; org: string; name: string }>;
  /** The signed-in viewer's numeric GitHub id (`assignee=me`). */
  viewerGithubId?: number | null;
  /** Login -> numeric id resolver (case-insensitive) for assignee names. */
  resolveLogin?: (login: string) => number | undefined;
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
  repos: FilterContext["repos"],
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
    if (match && !out.includes(match.githubId)) out.push(match.githubId);
  }
  return out;
}

function resolveAssignees(
  values: readonly string[],
  ctx: FilterContext,
): number[] {
  const out: number[] = [];
  const push = (id: number | undefined) => {
    if (typeof id === "number" && Number.isFinite(id) && !out.includes(id)) {
      out.push(id);
    }
  };
  for (const value of values) {
    if (value.toLowerCase() === "me") {
      push(ctx.viewerGithubId ?? undefined);
      continue;
    }
    if (/^\d+$/.test(value)) {
      push(Number(value));
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
  repos: FilterContext["repos"],
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
    if (match) refs.push({ repoId: match.githubId, number });
  }
  return { refs, none };
}

/**
 * Parse URL query parameters into a validated {@link IssueFilter}. Unknown
 * params and unparseable values are dropped silently, mirroring GitHub.
 */
export function parseIssueFilter(
  params: URLSearchParams,
  ctx: FilterContext,
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
      (name) => !RESERVED_GROUP.has(name.toLowerCase()),
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

/** `EXISTS` clause for "assigned to any of these users" (OR within group). */
export function assigneeExists(userIds: readonly number[]): SQL {
  return exists(
    db
      .select({ one: sql`1` })
      .from(mirrorGithubIssueAssignee)
      .where(
        and(
          eq(mirrorGithubIssueAssignee.repoId, mirrorGithubIssue.repoId),
          eq(mirrorGithubIssueAssignee.issueNumber, mirrorGithubIssue.number),
          inArray(mirrorGithubIssueAssignee.userId, [...userIds]),
        ),
      ),
  );
}

/** `EXISTS` clause for "carries any of these labels" (OR within group). */
function labelExists(names: readonly string[]): SQL {
  return exists(
    db
      .select({ one: sql`1` })
      .from(mirrorGithubIssueLabel)
      .where(
        and(
          eq(mirrorGithubIssueLabel.repoId, mirrorGithubIssue.repoId),
          eq(mirrorGithubIssueLabel.issueNumber, mirrorGithubIssue.number),
          inArray(mirrorGithubIssueLabel.labelName, [...names]),
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
    conditions.push(inArray(mirrorGithubIssue.repoId, filter.repos));
  }

  for (const [column, values] of [
    [mirrorGithubIssue.state, filter.states],
    [mirrorGithubIssue.status, filter.statuses],
    [mirrorGithubIssue.priority, filter.priorities],
    [mirrorGithubIssue.size, filter.sizes],
  ] as const) {
    const clause = dimension(column, values);
    if (clause) conditions.push(clause);
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
          eq(mirrorGithubIssue.repoId, m.repoId),
          eq(mirrorGithubIssue.milestoneNumber, m.number),
        ) as SQL,
    );
    if (filter.noMilestone) {
      parts.push(isNull(mirrorGithubIssue.milestoneNumber) as SQL);
    }
    conditions.push(parts.length === 1 ? parts[0] : (or(...parts) as SQL));
  }

  if (filter.search.length > 0) {
    const pattern = `%${escapeLike(filter.search)}%`;
    const like = (column: unknown) =>
      sql`${column} LIKE ${pattern} ESCAPE '\\'`;
    conditions.push(
      or(
        like(mirrorGithubIssue.title),
        like(mirrorGithubIssue.body),
        exists(
          db
            .select({ one: sql`1` })
            .from(mirrorGithubComment)
            .where(
              and(
                eq(mirrorGithubComment.repoId, mirrorGithubIssue.repoId),
                eq(mirrorGithubComment.issueNumber, mirrorGithubIssue.number),
                like(mirrorGithubComment.body),
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
