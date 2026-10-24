/**
 * Scheduling mutations and the hard 60% cap (SPEC §4, §7).
 *
 * GitHub stays authoritative for size, assignees and state, so a schedule
 * decision is re-derived from the mirror on every call. The write is local
 * (`state_plan_item`) and is rejected unless the issue is mirrored, open,
 * estimated and owned by an active maintainer, and unless every affected
 * maintainer's lane still fits after the candidate is applied. Moving an issue
 * only writes the new week, so its old week frees immediately.
 */
import { isMondayISO } from "#lib/server/planning/calendar";
import {
  distributeIssues,
  estimateMinutes,
  maintainerKey,
  type CapacityIssue,
  type CapacityMaintainer,
  type CapacityViolation,
} from "#lib/server/planning/capacity";
import {
  getPlanningIssue,
  listPlannedIssues,
  type PlanningIssue,
} from "#lib/server/planning/queries";
import {
  clearPlanItem,
  setPlanItem,
  type PlanItemRecord,
} from "#lib/server/planning/store";
import {
  readSettings,
  type MaintainerInput,
  type Settings,
} from "#lib/server/settings/store";
import type { UserRef } from "#lib/server/issues/types";

/** The identity of the issue being scheduled. */
export interface ScheduleTarget {
  org: string;
  name: string;
  issueNumber: number;
}

/** One request to schedule (or move) an issue to a Monday week. */
export interface ScheduleInput extends ScheduleTarget {
  weekStart: string;
}

/**
 * The result of a schedule attempt. Failures carry the HTTP status the API
 * should return; cap failures also name the violating lanes.
 */
export type ScheduleResult =
  | { ok: true }
  | {
      ok: false;
      status: 400 | 404 | 409;
      message: string;
      violations?: CapacityViolation[];
    };

function fail(
  status: 400 | 404 | 409,
  message: string,
  violations?: CapacityViolation[],
): ScheduleResult {
  return violations === undefined
    ? { ok: false, status, message }
    : { ok: false, status, message, violations };
}

/** Settings' snake_case roster row as the capacity model sees it. */
function toMaintainer(row: MaintainerInput): CapacityMaintainer {
  return {
    forge: row.forge,
    instance: row.instance,
    externalId: row.external_id,
    login: row.login,
    avatarUrl: row.avatar_url ?? null,
    weeklyMinutes: row.weekly_minutes,
    active: row.active,
  };
}

/** Stable capacity key for a mirrored assignee. */
function keyOf(user: UserRef): string {
  return `${user.forge}:${user.instance}:${user.externalId}`;
}

/** Project one mirrored issue into the integer-minute capacity model. */
function toCapacityIssue(
  issue: PlanningIssue,
  sizeMinutes: Settings["planning"]["size_minutes"],
): CapacityIssue {
  return {
    estimateMinutes: estimateMinutes(issue.size, sizeMinutes),
    assignees: issue.assignees.map(keyOf),
  };
}

/**
 * Schedule one issue to one Monday week, enforcing the hard allocation cap.
 *
 * Rejections, in order: a malformed week, a missing mirror row, a closed
 * issue, an unestimated issue, and an issue whose assignees include no active
 * maintainer (the "unowned" case from SPEC §7). Re-scheduling to the week the
 * issue already occupies is a no-op. Otherwise the target week is projected
 * with the issue excluded, and any affected lane over its cap yields a 409.
 */
export function scheduleIssue(input: ScheduleInput): ScheduleResult {
  if (!isMondayISO(input.weekStart)) {
    return fail(400, "week_start must be a Monday in YYYY-MM-DD form");
  }

  const issue = getPlanningIssue(input.org, input.name, input.issueNumber);
  if (issue === undefined) {
    return fail(404, "Issue is not mirrored");
  }
  if (issue.state !== "open") {
    return fail(400, "Only open issues can be scheduled");
  }

  const { planning } = readSettings();
  const estimate = estimateMinutes(issue.size, planning.size_minutes);
  if (estimate === null) {
    return fail(400, "Issue has no size estimate");
  }

  const maintainers = planning.maintainers.map(toMaintainer);
  const active = maintainers.filter((maintainer) => maintainer.active);
  const activeKeys = new Set(active.map(maintainerKey));
  const candidateAssignees = issue.assignees.map(keyOf).filter((key) => activeKeys.has(key));
  if (candidateAssignees.length === 0) {
    return fail(400, "Issue has no active maintainer assignee");
  }

  // Same-week writes change nothing; never re-check the cap for a no-op.
  if (issue.weekStart === input.weekStart) {
    return { ok: true };
  }

  const existing = listPlannedIssues({ weekStart: input.weekStart })
    .filter(
      (planned) =>
        !(planned.repoId === issue.repoId && planned.number === issue.number),
    )
    .map((planned) => toCapacityIssue(planned, planning.size_minutes));

  const projected = [...existing, toCapacityIssue(issue, planning.size_minutes)];
  const loginByKey = new Map(
    active.map((maintainer) => [maintainerKey(maintainer), maintainer.login]),
  );
  const affectedKeys = new Set(candidateAssignees);
  const violations: CapacityViolation[] = distributeIssues(
    projected,
    maintainers,
    planning.allocation_percent,
    1,
  )
    .totals.filter((lane) => lane.over && affectedKeys.has(lane.key))
    .map((lane) => ({
      login: loginByKey.get(lane.key) ?? lane.key,
      capMinutes: lane.capMinutes,
      committedMinutes: lane.committedMinutes,
      excessMinutes: lane.committedMinutes - lane.capMinutes,
    }));

  if (violations.length > 0) {
    return fail(409, "Week capacity exceeded", violations);
  }

  setPlanItem({
    org: input.org,
    name: input.name,
    issueNumber: input.issueNumber,
    weekStart: input.weekStart,
  });
  return { ok: true };
}

/**
 * Remove an issue's plan item. Idempotent: the return value says whether a row
 * existed, but the caller's response is the same either way.
 */
export function unscheduleIssue(input: ScheduleTarget): boolean {
  return clearPlanItem(input.org, input.name, input.issueNumber);
}

/** Re-exported so API callers can type the stored row without a second import. */
export type { PlanItemRecord };
