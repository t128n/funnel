/**
 * Milestone capacity planning (SPEC §5).
 *
 * The milestone horizon is read-only: it groups every open issue attached to an
 * open milestone by `(repo, milestone number)` and distributes their estimates
 * across the configured maintainers. Capacity weeks run from `now` to the due
 * date, rounded up; a milestone without a due date still shows committed hours
 * but has no cap and can never be over.
 *
 * Milestone identity is repo-scoped, so two repos using the same milestone
 * number and title stay separate plans.
 */
import type { FunnelConfig } from "#lib/server/config";
import { getConfig } from "#lib/server/config";
import { weeksUntilDue } from "./calendar";
import type { PlanningIssue } from "./queries";
import { listMilestoneIssues } from "./queries";
import { planBuckets, type PlanLane, type PlanUnassigned } from "./plans";

/** One open milestone's capacity plan. */
export interface MilestonePlan {
  /** `owner/name` of the milestone's repository. */
  repo: string;
  number: number;
  title: string;
  /** Due date in Unix milliseconds, or `null` when the milestone has none. */
  dueOn: number | null;
  /** Weeks from `now` to the due date; `null` when there is no due date. */
  capacityWeeks: number | null;
  lanes: PlanLane[];
  unassigned: PlanUnassigned;
  unestimated: PlanningIssue[];
}

/** Format a millisecond timestamp as its UTC `YYYY-MM-DD` calendar day. */
function isoDay(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

interface MilestoneGroup {
  repo: string;
  number: number;
  title: string;
  dueOn: number | null;
  issues: PlanningIssue[];
}

/**
 * Every open milestone with open issues, as a capacity plan. Pass `now` to pin
 * the due-date window in tests; it defaults to the current instant.
 */
export async function milestonePlans(
  now: Date | string = new Date(),
): Promise<MilestonePlan[]> {
  const config: FunnelConfig = await getConfig();
  const groups = new Map<string, MilestoneGroup>();

  for (const issue of listMilestoneIssues()) {
    const milestone = issue.milestone;
    if (milestone === null) continue;
    const key = `${issue.repo}\u0000${milestone.number}`;
    const group = groups.get(key) ?? {
      repo: issue.repo,
      number: milestone.number,
      title: milestone.title,
      dueOn: milestone.dueOn,
      issues: [],
    };
    group.issues.push(issue);
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => {
    const capacityWeeks =
      group.dueOn === null
        ? null
        : weeksUntilDue(isoDay(group.dueOn), now);
    const buckets = planBuckets(
      group.issues,
      config.planning,
      capacityWeeks,
    );
    return {
      repo: group.repo,
      number: group.number,
      title: group.title,
      dueOn: group.dueOn,
      capacityWeeks,
      lanes: buckets.lanes,
      unassigned: buckets.unassigned,
      unestimated: buckets.unestimated,
    } satisfies MilestonePlan;
  });
}
