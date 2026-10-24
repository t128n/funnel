/**
 * `/plan` load (SPEC §5).
 *
 * One read page with three horizons: a single Monday week, the configured
 * cycle around it, and the read-only milestone capacity view. Every horizon
 * returns the same vocabulary — lanes, unassigned work, unestimated issues and
 * the scheduling candidate list — so the page can switch tabs without a second
 * data path.
 *
 * Query parameters are defensive: an unknown `horizon` falls back to `week`,
 * and a `week`/`cycle` that is not a real Monday falls back to the current
 * week and its cycle. Navigation targets are resolved here so the browser
 * bundle never imports the server calendar module.
 */
import { requireUser } from "#lib/server/auth/guard";
import { getConfig } from "#lib/server/config";
import {
  addWeeks,
  cycleForWeek,
  isMondayISO,
  weekStartOf,
} from "#lib/server/planning/calendar";
import { milestonePlans } from "#lib/server/planning/milestones";
import { cyclePlan, weekPlan } from "#lib/server/planning/plans";
import { listPlanCandidates } from "#lib/server/planning/queries";
import type { PageServerLoad } from "./$types";

/** The three planning horizons exposed by `/plan`. */
export type PlanHorizon = "week" | "cycle" | "milestone";

function parseHorizon(raw: string | null): PlanHorizon {
  if (raw === "cycle" || raw === "milestone") return raw;
  return "week";
}

/** A Monday query parameter, or `fallback` when absent or malformed. */
function parseWeek(raw: string | null, fallback: string): string {
  return raw !== null && isMondayISO(raw) ? raw : fallback;
}

export const load: PageServerLoad = async ({ locals, url }) => {
  requireUser(locals, url);

  const config = await getConfig();
  const planning = config.planning;
  const horizon = parseHorizon(url.searchParams.get("horizon"));

  const week = parseWeek(url.searchParams.get("week"), weekStartOf(new Date()));
  const cycle = cycleForWeek(
    parseWeek(url.searchParams.get("cycle"), week),
    planning.cycle_anchor,
    planning.cycle_weeks,
  ).key;

  const [weekView, cycleView, milestones] = await Promise.all([
    weekPlan(week),
    cyclePlan(cycle),
    milestonePlans(),
  ]);

  const previous =
    horizon === "week"
      ? addWeeks(week, -1)
      : horizon === "cycle"
        ? addWeeks(cycle, -planning.cycle_weeks)
        : null;
  const next =
    horizon === "week"
      ? addWeeks(week, 1)
      : horizon === "cycle"
        ? addWeeks(cycle, planning.cycle_weeks)
        : null;

  return {
    horizon,
    week,
    cycle,
    previous,
    next,
    weekPlan: weekView,
    cyclePlan: cycleView,
    milestones,
    candidates: listPlanCandidates(),
    maintainers: planning.maintainers,
    allocationPercent: planning.allocation_percent,
  };
};
