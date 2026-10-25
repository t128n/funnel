/**
 * `/settings/availability` (SPEC §8).
 *
 * Personal day-planning state: the viewer's working hours, unavailable windows
 * and the non-secret half of their calendar feed. The settings layout already
 * enforces a session and admits `read` for this path; the load only projects
 * the caller's rows and never the raw feed token.
 */
import { requireUser } from "#lib/server/auth/guard";
import { getConfig } from "#lib/server/config";
import {
  listWindows,
  readCalendarFeed,
  readWorkHours,
  type CalendarFeed,
} from "#lib/server/planning/day-store";
import { readSettings } from "#lib/server/settings/store";
import {
  hoursFromDefaults,
  type DayWindow,
  type WorkDefaultsInput,
  type WorkHours,
} from "#lib/planning/availability";
import type { PageServerLoad } from "./$types";

/** Everything the availability page renders from the server. */
export interface AvailabilityData {
  /** Stored hours, or the admin `planning.work_defaults` when none exist. */
  hours: WorkHours;
  /** Recurring and one-off blocked windows, in display order. */
  windows: DayWindow[];
  /** Feed hint and creation time only; the URL is returned by POST alone. */
  feed: CalendarFeed | null;
}

/**
 * Compose one viewer's availability. A stored `state_work_hours` row wins;
 * otherwise the admin `planning.work_defaults` supplies the hours.
 */
export function _loadAvailability(
  userId: string,
  workDefaults: WorkDefaultsInput = readSettings().planning.work_defaults,
): AvailabilityData {
  return {
    hours: readWorkHours(userId) ?? hoursFromDefaults(workDefaults),
    windows: listWindows(userId),
    feed: readCalendarFeed(userId),
  };
}

export const load: PageServerLoad = async ({ locals, url }) => {
  const user = requireUser(locals, url);
  const config = await getConfig();
  return _loadAvailability(user.id, config.planning.work_defaults);
};
