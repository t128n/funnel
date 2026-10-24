/**
 * Planning reads over the mirror + durable plan state.
 *
 * GitHub stays authoritative: every returned issue is hydrated from
 * `mirror_thread`/`mirror_repo`, and only scheduling lives in
 * `state_plan_item`. Assignees are attached in one batched query per call, so a
 * week or cycle view never devolves into N+1 lookups.
 *
 * A plan row whose mirror issue is closed or no longer mirrored is deliberately
 * absent from {@link listPlannedIssues}: it must not reserve capacity (spec §3).
 * {@link getPlanningIssue} still returns closed issues so a mutation can explain
 * why an issue cannot be scheduled.
 */
import { and, asc, desc, eq, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import {
  mirrorMilestone,
  mirrorRepo,
  mirrorRepoAssignee,
  mirrorThread,
  mirrorThreadAssignee,
  mirrorUser,
  statePlanItem,
} from "#lib/server/db/schema";
import type { RepoMilestoneRef, UserRef } from "#lib/server/issues/types";

/** One mirrored issue as the planner sees it, with its schedule when planned. */
export interface PlanningIssue {
  repoId: number;
  /** `owner/name`, resolved from `mirror_repo`. */
  repo: string;
  number: number;
  title: string;
  state: string;
  /** Size labels are estimates: `sm` | `md` | `lg`, or `null` when unestimated. */
  size: string | null;
  /** Derived `P1`–`P3`, or `null` when unprioritized. */
  priority: string | null;
  assignees: UserRef[];
  milestone: RepoMilestoneRef | null;
  /** Monday `YYYY-MM-DD` when scheduled, `null` for a candidate. */
  weekStart: string | null;
}

interface PlanningRow {
  repoId: number;
  number: number;
  title: string;
  state: string;
  size: string | null;
  priority: string | null;
  org: string;
  name: string;
  weekStart: string | null;
  milestoneNumber: number | null;
  milestoneTitle: string | null;
  milestoneState: string | null;
  milestoneDueOn: number | null;
}

/** Columns shared by every planning select (plan and milestone are left joins). */
const planningColumns = {
  repoId: mirrorThread.repoId,
  number: mirrorThread.number,
  title: mirrorThread.title,
  state: mirrorThread.state,
  size: mirrorThread.size,
  priority: mirrorThread.priority,
  org: mirrorRepo.org,
  name: mirrorRepo.name,
  weekStart: statePlanItem.weekStart,
  milestoneNumber: mirrorThread.milestoneNumber,
  milestoneTitle: mirrorMilestone.title,
  milestoneState: mirrorMilestone.state,
  milestoneDueOn: mirrorMilestone.dueOn,
};

function rowKey(repoId: number, number: number): string {
  return `${repoId}:${number}`;
}

/** Attach assignees to raw planning rows in one batched query. */
function hydrate(rows: PlanningRow[]): PlanningIssue[] {
  if (rows.length === 0) return [];

  const tuple = sql.join(
    rows.map((row) => sql`(${row.repoId}, ${row.number})`),
    sql`, `,
  );
  const assigneeRows = db
    .select({
      repoId: mirrorThreadAssignee.repoId,
      number: mirrorThreadAssignee.threadNumber,
      externalId: mirrorUser.externalId,
      forge: mirrorUser.forge,
      instance: mirrorUser.instance,
      login: mirrorUser.login,
      avatarUrl: mirrorUser.avatarUrl,
    })
    .from(mirrorThreadAssignee)
    .innerJoin(mirrorUser, eq(mirrorThreadAssignee.userId, mirrorUser.id))
    .where(
      sql`(${mirrorThreadAssignee.repoId}, ${mirrorThreadAssignee.threadNumber}) IN (${tuple})`,
    )
    .orderBy(asc(mirrorUser.login))
    .all();

  const assignees = new Map<string, UserRef[]>();
  for (const row of assigneeRows) {
    const key = rowKey(row.repoId, row.number);
    const list = assignees.get(key) ?? [];
    list.push({
      externalId: row.externalId,
      forge: row.forge,
      instance: row.instance,
      login: row.login,
      avatarUrl: row.avatarUrl,
    });
    assignees.set(key, list);
  }

  return rows.map((row) => {
    const repo = `${row.org}/${row.name}`;
    return {
      repoId: row.repoId,
      repo,
      number: row.number,
      title: row.title,
      state: row.state,
      size: row.size,
      priority: row.priority,
      assignees: assignees.get(rowKey(row.repoId, row.number)) ?? [],
      milestone:
        row.milestoneNumber !== null && row.milestoneTitle !== null
          ? {
              repo,
              number: row.milestoneNumber,
              title: row.milestoneTitle,
              state: row.milestoneState ?? "open",
              dueOn: row.milestoneDueOn,
            }
          : null,
      weekStart: row.weekStart,
    } satisfies PlanningIssue;
  });
}

/** Filters accepted by {@link listPlannedIssues}. */
export interface PlannedIssueFilter {
  weekStart?: string;
  /** Inclusive lower bound on `weekStart`. */
  from?: string;
  /** Inclusive upper bound on `weekStart`. */
  to?: string;
  org?: string;
  name?: string;
}

/**
 * Every planned issue whose mirror row still exists and is open, ordered by
 * week then priority. Closed or pruned issues are excluded so they free their
 * capacity immediately.
 */
export function listPlannedIssues(
  filter: PlannedIssueFilter = {},
): PlanningIssue[] {
  const clauses: SQL[] = [eq(mirrorThread.state, "open")];
  if (filter.weekStart !== undefined) {
    clauses.push(eq(statePlanItem.weekStart, filter.weekStart));
  }
  if (filter.from !== undefined) {
    clauses.push(sql`${statePlanItem.weekStart} >= ${filter.from}`);
  }
  if (filter.to !== undefined) {
    clauses.push(sql`${statePlanItem.weekStart} <= ${filter.to}`);
  }
  if (filter.org !== undefined) {
    clauses.push(eq(statePlanItem.org, filter.org));
  }
  if (filter.name !== undefined) {
    clauses.push(eq(statePlanItem.name, filter.name));
  }

  const rows = db
    .select(planningColumns)
    .from(statePlanItem)
    .innerJoin(
      mirrorRepo,
      and(
        eq(mirrorRepo.org, statePlanItem.org),
        eq(mirrorRepo.name, statePlanItem.name),
      ),
    )
    .innerJoin(
      mirrorThread,
      and(
        eq(mirrorThread.repoId, mirrorRepo.id),
        eq(mirrorThread.number, statePlanItem.issueNumber),
      ),
    )
    .leftJoin(
      mirrorMilestone,
      and(
        eq(mirrorMilestone.repoId, mirrorThread.repoId),
        eq(mirrorMilestone.number, mirrorThread.milestoneNumber),
      ),
    )
    .where(and(...clauses))
    .orderBy(
      asc(statePlanItem.weekStart),
      asc(mirrorThread.priorityRank),
      asc(mirrorRepo.org),
      asc(mirrorRepo.name),
      asc(mirrorThread.number),
    )
    .all() as PlanningRow[];

  return hydrate(rows);
}

/** Default candidate cap; the planner's "add issue" picker stays responsive. */
export const PLAN_CANDIDATE_LIMIT = 300;

/**
 * Issues that can be scheduled: open, triaged (`status` present) and sized,
 * with no plan row. Ordered by priority rank (P1 first, unprioritized last),
 * then most recently updated. Over-fetching is bounded by
 * {@link PLAN_CANDIDATE_LIMIT}.
 */
export function listPlanCandidates(
  limit: number = PLAN_CANDIDATE_LIMIT,
): PlanningIssue[] {
  const rows = db
    .select(planningColumns)
    .from(mirrorThread)
    .innerJoin(mirrorRepo, eq(mirrorThread.repoId, mirrorRepo.id))
    .leftJoin(
      mirrorMilestone,
      and(
        eq(mirrorMilestone.repoId, mirrorThread.repoId),
        eq(mirrorMilestone.number, mirrorThread.milestoneNumber),
      ),
    )
    .leftJoin(
      statePlanItem,
      and(
        eq(statePlanItem.org, mirrorRepo.org),
        eq(statePlanItem.name, mirrorRepo.name),
        eq(statePlanItem.issueNumber, mirrorThread.number),
      ),
    )
    .where(
      and(
        eq(mirrorThread.state, "open"),
        isNotNull(mirrorThread.status),
        isNotNull(mirrorThread.size),
        isNull(statePlanItem.org),
      ),
    )
    .orderBy(
      asc(mirrorThread.priorityRank),
      desc(mirrorThread.updatedAt),
      asc(mirrorThread.repoId),
      asc(mirrorThread.number),
    )
    .limit(Math.max(0, limit))
    .all() as PlanningRow[];

  return hydrate(rows);
}

/** Filters accepted by {@link listMilestoneIssues}. */
export interface MilestoneIssueFilter {
  /** `owner/name` of one repository. */
  repo?: string;
  milestoneNumber?: number;
}

/**
 * Open issues attached to an open milestone, with their schedule if any. The
 * milestone view groups these by `(repo, milestone.number)`.
 */
export function listMilestoneIssues(
  filter: MilestoneIssueFilter = {},
): PlanningIssue[] {
  const clauses: SQL[] = [
    eq(mirrorThread.state, "open"),
    eq(mirrorMilestone.state, "open"),
  ];
  if (filter.repo !== undefined) {
    const [org, name] = filter.repo.split("/");
    clauses.push(eq(mirrorRepo.org, org), eq(mirrorRepo.name, name));
  }
  if (filter.milestoneNumber !== undefined) {
    clauses.push(eq(mirrorMilestone.number, filter.milestoneNumber));
  }

  const rows = db
    .select(planningColumns)
    .from(mirrorThread)
    .innerJoin(mirrorRepo, eq(mirrorThread.repoId, mirrorRepo.id))
    .innerJoin(
      mirrorMilestone,
      and(
        eq(mirrorMilestone.repoId, mirrorThread.repoId),
        eq(mirrorMilestone.number, mirrorThread.milestoneNumber),
      ),
    )
    .leftJoin(
      statePlanItem,
      and(
        eq(statePlanItem.org, mirrorRepo.org),
        eq(statePlanItem.name, mirrorRepo.name),
        eq(statePlanItem.issueNumber, mirrorThread.number),
      ),
    )
    .where(and(...clauses))
    .orderBy(
      asc(mirrorRepo.org),
      asc(mirrorRepo.name),
      asc(mirrorMilestone.number),
      asc(mirrorThread.priorityRank),
      asc(mirrorThread.number),
    )
    .all() as PlanningRow[];

  return hydrate(rows);
}

/**
 * Users assignable on the configured repositories — the maintainer-roster
 * candidate set (spec §6). Pass `repoSlugs` to scope to the configured repos;
 * omit it to list every mirrored repo's assignable users.
 */
export function listAssigneeCandidates(
  repoSlugs?: readonly string[],
): UserRef[] {
  if (repoSlugs !== undefined && repoSlugs.length === 0) return [];

  const repoMatches = repoSlugs?.map((slug) => {
    const [org, name] = slug.split("/");
    return and(eq(mirrorRepo.org, org), eq(mirrorRepo.name, name)) as SQL;
  });
  const where =
    repoMatches === undefined
      ? undefined
      : repoMatches.length === 1
        ? repoMatches[0]
        : or(...repoMatches);

  return db
    .selectDistinct({
      externalId: mirrorUser.externalId,
      forge: mirrorUser.forge,
      instance: mirrorUser.instance,
      login: mirrorUser.login,
      avatarUrl: mirrorUser.avatarUrl,
    })
    .from(mirrorRepoAssignee)
    .innerJoin(mirrorUser, eq(mirrorRepoAssignee.userId, mirrorUser.id))
    .innerJoin(mirrorRepo, eq(mirrorRepoAssignee.repoId, mirrorRepo.id))
    .where(where)
    .orderBy(asc(mirrorUser.login))
    .all();
}

/**
 * One planning issue by mirror identity, whether open or closed. Returns
 * `undefined` when the issue is not mirrored. Used by mutations to reject a
 * missing or closed issue before writing.
 */
export function getPlanningIssue(
  org: string,
  name: string,
  number: number,
): PlanningIssue | undefined {
  const row = db
    .select(planningColumns)
    .from(mirrorThread)
    .innerJoin(mirrorRepo, eq(mirrorThread.repoId, mirrorRepo.id))
    .leftJoin(
      mirrorMilestone,
      and(
        eq(mirrorMilestone.repoId, mirrorThread.repoId),
        eq(mirrorMilestone.number, mirrorThread.milestoneNumber),
      ),
    )
    .leftJoin(
      statePlanItem,
      and(
        eq(statePlanItem.org, mirrorRepo.org),
        eq(statePlanItem.name, mirrorRepo.name),
        eq(statePlanItem.issueNumber, mirrorThread.number),
      ),
    )
    .where(
      and(
        eq(mirrorRepo.org, org),
        eq(mirrorRepo.name, name),
        eq(mirrorThread.number, number),
      ),
    )
    .get() as PlanningRow | undefined;

  return row ? hydrate([row])[0] : undefined;
}
