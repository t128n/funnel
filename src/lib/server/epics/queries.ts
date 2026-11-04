/**
 * Epic reads and rollups (SPEC §3, §4).
 *
 * An epic is a mirrored issue carrying the `epic` label. Its children are the
 * ordered `owner/name#number` refs in the issue body's `epic.children` scalar;
 * there is no membership table. Reads parse that list, resolve each ref against
 * the mirror, and sum the same time summaries the Inspector renders.
 *
 * Missing children (not mirrored, pruned, or cross-repo and unconfigured) are
 * skipped from rollups and surfaced in the detail as unavailable placeholders,
 * so an epic never loses a child from its written list.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { readEpicChildren, type EpicRef } from "#lib/funnel-metadata";
import { db } from "#lib/server/db/index";
import {
  mirrorMilestone,
  mirrorRepo,
  mirrorThread,
} from "#lib/server/db/schema";
import {
  getIssueListItem,
} from "#lib/server/issues/queries";
import type { IssueListItem, UserRef } from "#lib/server/issues/types";
import {
  batchIssueTime,
  issueTimeKey,
  type IssueTimeTarget,
} from "#lib/server/actuals/store";
import type { IssueTime } from "#lib/server/actuals/time";

export type { EpicRef };

/** Aggregate time and completion figures shared by the list and detail. */
export interface EpicRollup {
  /** Resolved children only; unavailable refs are not counted. */
  childCount: number;
  closedChildCount: number;
  /** `closed / childCount`, `0` when there are no resolved children. */
  progress: number;
  estimateMinutes: number;
  actualMinutes: number;
  delayMinutes: number;
}

/** One row in the epics list (SPEC §4). */
export interface EpicSummary extends EpicRollup {
  /** Canonical `owner/name#number` ref of the epic issue. */
  ref: string;
  repo: string;
  number: number;
  title: string;
  state: string;
  /** The epic issue's workflow status, or `null` when it has no status label. */
  status: string | null;
  /** The epic issue's repository milestone, or `null` when unmilestoned. */
  milestone: { number: number; title: string; dueOn: number | null } | null;
  updatedAt: number;
}

/** One child row in an epic detail (SPEC §4). */
export interface EpicChild {
  ref: string;
  repo: string;
  number: number;
  title: string;
  state: string;
  status: string | null;
  assignees: UserRef[];
  /** False when the ref is not mirrored; the row is then a placeholder. */
  available: boolean;
  estimateMinutes: number | null;
  actualMinutes: number;
  delayMinutes: number;
}

/** The epic issue plus its ordered children and rollups. */
export interface EpicDetail extends EpicSummary {
  issue: IssueListItem;
  children: EpicChild[];
}

interface EpicRow {
  repoId: number;
  org: string;
  name: string;
  number: number;
  title: string;
  state: string;
  status: string | null;
  body: string;
  updatedAt: number;
  milestoneNumber: number | null;
  milestoneTitle: string | null;
  milestoneDueOn: number | null;
}

interface ResolvedRef {
  repoId: number;
  org: string;
  name: string;
  number: number;
}

/** Case-insensitive identity, matching forge repo/platform rules. */
function refKey(ref: EpicRef | string): string {
  const parsed =
    typeof ref === "string"
      ? (() => {
          const match = /^([^/#]+)\/([^#]+)#(\d+)$/.exec(ref.trim());
          return match
            ? {
                owner: match[1],
                name: match[2],
                number: Number(match[3]),
              }
            : null;
        })()
      : ref;
  if (!parsed) return typeof ref === "string" ? ref.trim().toLowerCase() : "";
  return `${parsed.owner.toLowerCase()}/${parsed.name.toLowerCase()}#${parsed.number}`;
}

function issueRef(row: { org: string; name: string; number: number }): string {
  return `${row.org}/${row.name}#${row.number}`;
}

function selfRef(row: {
  org: string;
  name: string;
  number: number;
}): EpicRef {
  return { owner: row.org, name: row.name, number: row.number };
}

/** Resolve ordered child refs to mirrored issue rows in one query. */
function resolveRefs(refs: readonly string[]): Map<string, ResolvedRef> {
  const resolved = new Map<string, ResolvedRef>();
  const parsed = new Map<string, EpicRef>();
  for (const ref of refs) {
    const match = /^([^/#]+)\/([^#]+)#(\d+)$/.exec(ref.trim());
    if (!match) continue;
    const value = {
      owner: match[1],
      name: match[2],
      number: Number(match[3]),
    };
    parsed.set(refKey(value), value);
  }
  if (parsed.size === 0) return resolved;

  const conditions = [...parsed.values()].map(
    (ref) => sql`(
      lower(${mirrorRepo.org}) = ${ref.owner.toLowerCase()}
      AND lower(${mirrorRepo.name}) = ${ref.name.toLowerCase()}
      AND ${mirrorThread.number} = ${ref.number}
    )`,
  );
  const rows = db
    .select({
      repoId: mirrorThread.repoId,
      org: mirrorRepo.org,
      name: mirrorRepo.name,
      number: mirrorThread.number,
    })
    .from(mirrorThread)
    .innerJoin(mirrorRepo, eq(mirrorThread.repoId, mirrorRepo.id))
    .where(sql`(${sql.join(conditions, sql` OR `)})`)
    .all();
  for (const row of rows) resolved.set(refKey(selfRef(row)), row);
  return resolved;
}

/** One zeroed summary for a ref that is not mirrored. */
function missingTime(): IssueTime {
  return {
    actualMinutes: 0,
    delayMinutes: 0,
    estimateMinutes: null,
    varianceMinutes: null,
    leadMinutes: 0,
    cycleMinutes: 0,
    delayCount: 0,
  };
}

function timeTarget(row: {
  org: string;
  name: string;
  number: number;
}): IssueTimeTarget {
  return { org: row.org, name: row.name, number: row.number };
}

function toRollup(children: readonly EpicChild[]): EpicRollup {
  const available = children.filter((child) => child.available);
  const closed = available.filter((child) => child.state === "closed").length;
  return {
    childCount: available.length,
    closedChildCount: closed,
    progress: available.length === 0 ? 0 : closed / available.length,
    estimateMinutes: available.reduce(
      (sum, child) => sum + (child.estimateMinutes ?? 0),
      0,
    ),
    actualMinutes: available.reduce(
      (sum, child) => sum + child.actualMinutes,
      0,
    ),
    delayMinutes: available.reduce(
      (sum, child) => sum + child.delayMinutes,
      0,
    ),
  };
}

function childRows(
  refs: readonly string[],
  resolved: ReadonlyMap<string, ResolvedRef>,
  times: ReadonlyMap<string, IssueTime>,
): EpicChild[] {
  return refs.map((ref) => {
    const row = resolved.get(refKey(ref));
    const match = /^([^/#]+)\/([^#]+)#(\d+)$/.exec(ref);
    const owner = row?.org ?? match?.[1] ?? "";
    const name = row?.name ?? match?.[2] ?? "";
    const number = row?.number ?? Number(match?.[3] ?? 0);
    const canonical = `${owner}/${name}#${number}`;
    if (!row) {
      return {
        ref: canonical,
        repo: `${owner}/${name}`,
        number,
        title: "",
        state: "",
        status: null,
        assignees: [],
        available: false,
        estimateMinutes: null,
        actualMinutes: 0,
        delayMinutes: 0,
      };
    }
    const item = getIssueListItem(row.repoId, row.number);
    const time =
      times.get(issueTimeKey(timeTarget(row))) ??
      missingTime();
    return {
      ref: canonical,
      repo: `${row.org}/${row.name}`,
      number: row.number,
      title: item?.title ?? "",
      state: item?.state ?? "",
      status: item?.status ?? null,
      assignees: item?.assignees ?? [],
      available: true,
      estimateMinutes: time.estimateMinutes,
      actualMinutes: time.actualMinutes,
      delayMinutes: time.delayMinutes,
    };
  });
}

function summary(row: EpicRow, rollup: EpicRollup): EpicSummary {
  return {
    ref: issueRef(row),
    repo: `${row.org}/${row.name}`,
    number: row.number,
    title: row.title,
    state: row.state,
    status: row.status,
    milestone:
      row.milestoneNumber !== null && row.milestoneTitle !== null
        ? {
            number: row.milestoneNumber,
            title: row.milestoneTitle,
            dueOn: row.milestoneDueOn,
          }
        : null,
    updatedAt: row.updatedAt,
    ...rollup,
  };
}

function epicRows(): EpicRow[] {
  return db
    .select({
      repoId: mirrorThread.repoId,
      org: mirrorRepo.org,
      name: mirrorRepo.name,
      number: mirrorThread.number,
      title: mirrorThread.title,
      state: mirrorThread.state,
      status: mirrorThread.status,
      body: mirrorThread.body,
      updatedAt: mirrorThread.updatedAt,
      milestoneNumber: mirrorThread.milestoneNumber,
      milestoneTitle: mirrorMilestone.title,
      milestoneDueOn: mirrorMilestone.dueOn,
    })
    .from(mirrorThread)
    .innerJoin(mirrorRepo, eq(mirrorThread.repoId, mirrorRepo.id))
    .leftJoin(
      mirrorMilestone,
      and(
        eq(mirrorMilestone.repoId, mirrorThread.repoId),
        eq(mirrorMilestone.number, mirrorThread.milestoneNumber),
      ),
    )
    .where(eq(mirrorThread.isEpic, 1))
    .orderBy(desc(mirrorThread.updatedAt), desc(mirrorThread.number))
    .all();
}

async function timesFor(
  rows: readonly { org: string; name: string; number: number }[],
): Promise<Map<string, IssueTime>> {
  return batchIssueTime(rows.map(timeTarget));
}

/**
 * Every epic, open before closed (SPEC §4). Within each state the newest
 * update comes first. Children are resolved from the body, so rollups always
 * reflect the visible issue set rather than a separate membership cache.
 */
export async function listEpics(): Promise<EpicSummary[]> {
  const rows = epicRows();
  const refsByEpic = new Map<string, string[]>();
  const allRefs = new Set<string>();
  for (const row of rows) {
    const refs = readEpicChildren(row.body, selfRef(row));
    refsByEpic.set(issueRef(row), refs);
    for (const ref of refs) allRefs.add(ref);
  }

  const resolved = resolveRefs([...allRefs]);
  const targets = [
    ...rows.map(timeTarget),
    ...[...resolved.values()].map(timeTarget),
  ];
  const times = await timesFor(targets);

  const epics = rows.map((row) => {
    const refs = refsByEpic.get(issueRef(row)) ?? [];
    const children = childRows(refs, resolved, times);
    return summary(row, toRollup(children));
  });

  return epics.sort((a, b) => {
    if (a.state !== b.state) return a.state === "open" ? -1 : 1;
    return b.updatedAt - a.updatedAt || a.ref.localeCompare(b.ref);
  });
}

/** Resolve one epic detail by ref, or `undefined` when it is not an epic. */
export async function getEpicDetail(
  ref: EpicRef | string,
): Promise<EpicDetail | undefined> {
  const key = refKey(ref);
  const row = epicRows().find((candidate) => refKey(issueRef(candidate)) === key);
  if (!row) return undefined;

  const refs = readEpicChildren(row.body, selfRef(row));
  const resolved = resolveRefs(refs);
  const targets = [
    timeTarget(row),
    ...[...resolved.values()].map(timeTarget),
  ];
  const times = await timesFor(targets);
  const children = childRows(refs, resolved, times);
  const issue = getIssueListItem(row.repoId, row.number);
  if (!issue) return undefined;

  return {
    ...summary(row, toRollup(children)),
    issue,
    children,
  };
}
