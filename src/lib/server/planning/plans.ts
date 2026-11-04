/**
 * Week and cycle planning views (SPEC §5).
 *
 * These are pure compositions: `listPlannedIssues` reads the mirror and the
 * durable plan rows, the settings roster supplies capacity, and
 * `distributeIssues` splits each estimate across active maintainers. Weeks are
 * ISO Monday weeks in UTC; a cycle is the configured number of contiguous
 * weeks counted from the configured anchor.
 *
 * Both functions are async because the instance config (and therefore the
 * allocation percentage, size map and maintainer roster) is loaded lazily.
 */
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getConfig } from "#lib/server/config";
import { db } from "#lib/server/db/index";
import {
  mirrorMilestone,
  mirrorRepo,
  mirrorThread,
  mirrorThreadAssignee,
  mirrorUser,
} from "#lib/server/db/schema";
import type { FunnelConfig } from "#lib/server/config";
import type { UserRef } from "#lib/server/issues/types";
import { weekLabel, weekStartOf } from "./calendar";
import {
  distributeIssues,
  estimateMinutes,
  type CapacityDistribution,
  type CapacityIssue,
  type CapacityMaintainer,
} from "./capacity";
import { listPlannedIssues, type PlanningIssue } from "./queries";

/** The maintainer summary a lane exposes (never the roster's `active` flag). */
export type PlanMaintainer = Omit<CapacityMaintainer, "active">;

/** One maintainer's cap and committed work for the window. */
export interface PlanLane {
  maintainer: PlanMaintainer;
  capMinutes: number;
  committedMinutes: number;
  remainingMinutes: number;
  over: boolean;
  issues: PlanningIssue[];
  /** Committed issues with no size; visible, but they add no minutes. */
  unsizedIssues: PlanningIssue[];
}

/** Sized work with no active, configured assignee. It has no cap. */
export interface PlanUnassigned {
  committedMinutes: number;
  issues: PlanningIssue[];
  /** Committed issues with no size and no active maintainer. */
  unsizedIssues: PlanningIssue[];
}

/** One Monday week: lanes, unassigned work and open unsized issues. */
export interface WeekPlan {
  weekStart: string;
  label: string;
  lanes: PlanLane[];
  unassigned: PlanUnassigned;
  unestimated: PlanningIssue[];
}

/** Lanes and the unassigned bucket for one window. */
export interface PlanBuckets {
  lanes: PlanLane[];
  unassigned: PlanUnassigned;
  unestimated: PlanningIssue[];
}

export type Planning = FunnelConfig["planning"];

/** Roster rows as capacity sees them. Ordering is preserved for lane order. */
function capacityMaintainers(planning: Planning): CapacityMaintainer[] {
  return planning.maintainers.map((maintainer) => ({
    forge: maintainer.forge,
    instance: maintainer.instance,
    externalId: maintainer.external_id,
    login: maintainer.login,
    avatarUrl: maintainer.avatar_url ?? null,
    weeklyMinutes: maintainer.weekly_minutes,
    active: maintainer.active,
  }));
}

/** Identity key shared with `distributeIssues` and the roster. */
function userKey(user: UserRef): string {
  return `${user.forge}:${user.instance}:${user.externalId}`;
}

function toCapacityIssue(
  issue: PlanningIssue,
  planning: Planning,
): CapacityIssue {
  return {
    estimateMinutes: estimateMinutes(
      issue.size,
      planning.size_minutes as Record<string, number>,
    ),
    assignees: issue.assignees.map(userKey),
  };
}

function laneMaintainer(maintainer: CapacityMaintainer): PlanMaintainer {
  return {
    forge: maintainer.forge,
    instance: maintainer.instance,
    externalId: maintainer.externalId,
    login: maintainer.login,
    avatarUrl: maintainer.avatarUrl,
    weeklyMinutes: maintainer.weeklyMinutes,
  };
}

/** Resolve a distribution's issue indexes back to the issues it consumed. */
function issuesAt(
  indexes: readonly number[],
  issues: readonly PlanningIssue[],
): PlanningIssue[] {
  return indexes
    .map((index) => issues[index])
    .filter((issue): issue is PlanningIssue => issue !== undefined);
}

/** Turn one capacity distribution into the plan's lanes and buckets. */
function bucketsFrom(
  distribution: CapacityDistribution,
  maintainers: readonly CapacityMaintainer[],
  issues: readonly PlanningIssue[],
): PlanBuckets {
  const byKey = new Map(
    maintainers
      .filter((maintainer) => maintainer.active)
      .map((maintainer) => [
        `${maintainer.forge}:${maintainer.instance}:${maintainer.externalId}`,
        maintainer,
      ]),
  );
  const lanes = distribution.totals.map((total) => {
    const maintainer = byKey.get(total.key);
    return {
      maintainer: laneMaintainer(
        maintainer ?? {
          forge: "",
          instance: "",
          externalId: total.key,
          login: total.key,
          avatarUrl: null,
          weeklyMinutes: 0,
          active: true,
        },
      ),
      capMinutes: total.capMinutes,
      committedMinutes: total.committedMinutes,
      remainingMinutes: total.remainingMinutes,
      over: total.over,
      issues: issuesAt(total.issueIndexes, issues),
      unsizedIssues: issuesAt(total.unsizedIssueIndexes, issues),
    } satisfies PlanLane;
  });
  return {
    lanes,
    unassigned: {
      committedMinutes: distribution.unassigned.committedMinutes,
      issues: issuesAt(distribution.unassigned.issueIndexes, issues),
      unsizedIssues: issuesAt(
        distribution.unassigned.unsizedIssueIndexes,
        issues,
      ),
    },
    unestimated: issuesAt(distribution.unestimated, issues),
  };
}

/**
 * Lanes and buckets for an explicit issue list and window. Exported for the
 * milestone view and for mutation projections; `weeks: null` means "no cap".
 */
export function planBuckets(
  issues: readonly PlanningIssue[],
  planning: Planning,
  weeks: number | null,
): PlanBuckets {
  const maintainers = capacityMaintainers(planning);
  return bucketsFrom(
    distributeIssues(
      issues.map((issue) => toCapacityIssue(issue, planning)),
      maintainers,
      planning.allocation_percent,
      weeks,
    ),
    maintainers,
    issues,
  );
}

/** Minimal planning row shape for the unestimated scan. */
interface UnestimatedRow {
  repoId: number;
  number: number;
  title: string;
  state: string;
  size: string | null;
  priority: string | null;
  org: string;
  name: string;
  milestoneNumber: number | null;
  milestoneTitle: string | null;
  milestoneState: string | null;
  milestoneDueOn: number | null;
}

/**
 * Every open issue without a size label. They cannot be scheduled and never
 * contribute committed minutes, but the planner still lists them so they can
 * be estimated. Untriaged issues are included: the point is to surface missing
 * estimates, not to mirror the Inbox's triage partition.
 */
function openUnestimatedIssues(): PlanningIssue[] {
  const rows = db
    .select({
      repoId: mirrorThread.repoId,
      number: mirrorThread.number,
      title: mirrorThread.title,
      state: mirrorThread.state,
      size: mirrorThread.size,
      priority: mirrorThread.priority,
      org: mirrorRepo.org,
      name: mirrorRepo.name,
      milestoneNumber: mirrorThread.milestoneNumber,
      milestoneTitle: mirrorMilestone.title,
      milestoneState: mirrorMilestone.state,
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
    .where(and(eq(mirrorThread.state, "open"), isNull(mirrorThread.size)))
    .orderBy(
      asc(mirrorThread.priorityRank),
      desc(mirrorThread.updatedAt),
      asc(mirrorRepo.org),
      asc(mirrorRepo.name),
      asc(mirrorThread.number),
    )
    .all() as UnestimatedRow[];

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
    const key = `${row.repoId}:${row.number}`;
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
      assignees: assignees.get(`${row.repoId}:${row.number}`) ?? [],
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
      weekStart: null,
    } satisfies PlanningIssue;
  });
}

/**
 * One Monday week: every planned issue for that week distributed across the
 * active maintainers, plus the open unsized list. Planned issues whose mirror
 * row is closed or gone are already excluded by `listPlannedIssues`, so they
 * reserve no capacity.
 *
 * A planned issue with no size is kept as an unsized commitment in its lane
 * (or the unassigned bucket) and receives no minutes. It is removed from the
 * general unestimated queue because it already has a row on this page; other
 * unsized issues remain available to estimate.
 */
export async function weekPlan(week: string): Promise<WeekPlan> {
  const weekStart = weekStartOf(week);
  const config = await getConfig();
  const issues = listPlannedIssues({ weekStart });
  const buckets = planBuckets(issues, config.planning, 1);
  const committed = new Set(
    issues.map((issue) => `${issue.repoId}:${issue.number}`),
  );

  return {
    weekStart,
    label: weekLabel(weekStart),
    lanes: buckets.lanes,
    unassigned: buckets.unassigned,
    unestimated: openUnestimatedIssues().filter(
      (issue) => !committed.has(`${issue.repoId}:${issue.number}`),
    ),
  };
}
