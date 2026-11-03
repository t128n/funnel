/**
 * `/plan` load.
 *
 * One weekly capacity view: every issue committed to a Monday week, grouped
 * into the active maintainers' lanes, plus the unassigned and unestimated
 * buckets. Scheduling itself lives on the issue (`IssuePropertiesCard`), so
 * this page is read-only apart from removing an issue from the plan.
 *
 * The old `horizon=day` links move to `/day`; `cycle` and `milestone` no longer
 * have their own surfaces and settle on the current week.
 */
import { redirect } from "@sveltejs/kit";
import { requireUser } from "#lib/server/auth/guard";
import { getConfig } from "#lib/server/config";
import { addWeeks, isMondayISO, weekStartOf } from "#lib/server/planning/calendar";
import { weekPlan } from "#lib/server/planning/plans";
import type { PageServerLoad } from "./$types";

/** A Monday query parameter, or `fallback` when absent or malformed. */
function parseWeek(raw: string | null, fallback: string): string {
  return raw !== null && isMondayISO(raw) ? raw : fallback;
}

export const load: PageServerLoad = async ({ locals, url }) => {
  requireUser(locals, url);

  const horizon = url.searchParams.get("horizon");
  if (horizon === "day") {
    const day = url.searchParams.get("day");
    throw redirect(307, day ? `/day?day=${encodeURIComponent(day)}` : "/day");
  }
  if (horizon === "cycle" || horizon === "milestone") {
    throw redirect(307, "/plan");
  }

  const config = await getConfig();
  const week = parseWeek(url.searchParams.get("week"), weekStartOf(new Date()));
  const weekView = await weekPlan(week);

  return {
    week,
    previous: addWeeks(week, -1),
    next: addWeeks(week, 1),
    weekPlan: weekView,
    allocationPercent: config.planning.allocation_percent,
    sizeMinutes: config.planning.size_minutes,
    today: weekStartOf(new Date()),
  };
};
