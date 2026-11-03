/**
 * `/day` load: one viewer's ALPEN day.
 *
 * Day planning is personal. It narrows the issues committed to the local
 * week, places them into timed blocks and compares the plan with the actuals
 * clipped to that day. Working hours come from the viewer's own row, falling
 * back to `planning.work_defaults`.
 */
import { and, eq } from "drizzle-orm";
import { requireUser } from "#lib/server/auth/guard";
import { getConfig } from "#lib/server/config";
import { db } from "#lib/server/db/index";
import { mirrorRepo, mirrorThread } from "#lib/server/db/schema";
import { activeIntervals } from "#lib/server/actuals/time";
import { listIssueEvents } from "#lib/server/actuals/store";
import {
  availableMinutes,
  availableRanges,
  bufferMinutes,
  clipMinutes,
  hoursFromDefaults,
  issueRefKey,
  windowsForDate,
  type MinuteRange,
  type DayWindow,
  type WorkHours,
} from "#lib/planning/availability";
import {
  dayReview,
  type DayBlock,
  type DayCandidate,
  type DayReview,
} from "#lib/planning/day-plan";
import { listDayCandidates } from "#lib/server/planning/day-queries";
import {
  listDayBlocks,
  listWindows,
  readCalendarFeed,
  readWorkHours,
} from "#lib/server/planning/day-store";
import {
  addDaysISO,
  isDateISO,
  localDateOf,
  weekdayOf,
  zonedToInstant,
} from "#lib/time/zoned";
import type { PageServerLoad } from "./$types";

/**
 * One viewer's day: effective hours, the saved plan, actuals clipped to the
 * local day, ordered candidates and the read-only feed flag.
 */
export interface DayView {
  /** `YYYY-MM-DD`, the viewer's local day. */
  date: string;
  /** e.g. `Sun 25 Oct 2026`. */
  label: string;
  /** ISO 1..7. */
  weekday: number;
  workHours: WorkHours;
  startMinute: number;
  endMinute: number;
  windows: DayWindow[];
  blocks: DayBlock[];
  available: MinuteRange[];
  availableMinutes: number;
  bufferMinutes: number;
  plannedMinutes: number;
  bufferPlannedMinutes: number;
  candidates: DayCandidate[];
  review: DayReview;
  feedEnabled: boolean;
}

/** A real `YYYY-MM-DD` query parameter, or `fallback` when absent or malformed. */
function parseDay(raw: string | null, fallback: string): string {
  return raw !== null && isDateISO(raw) ? raw : fallback;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** `2026-10-25` → `Sun 25 Oct 2026`; locale-independent so tests are stable. */
function dayLabel(date: string): string {
  const [, month, day] = date.split("-").map(Number) as [number, number, number];
  const weekday = WEEKDAYS[weekdayOf(date) - 1] as string;
  return `${weekday} ${day} ${MONTHS[month - 1]} ${date.slice(0, 4)}`;
}

/**
 * The forge close time of an issue, when it is still mirrored. `activeIntervals`
 * uses it to end the last open interval at the authoritative close instant.
 */
function closedAtOf(org: string, name: string, issueNumber: number): number | null {
  const row = db
    .select({ closedAt: mirrorThread.closedAt })
    .from(mirrorThread)
    .innerJoin(mirrorRepo, eq(mirrorThread.repoId, mirrorRepo.id))
    .where(
      and(
        eq(mirrorRepo.org, org),
        eq(mirrorRepo.name, name),
        eq(mirrorThread.number, issueNumber),
      ),
    )
    .get();
  return row?.closedAt ?? null;
}

/**
 * Actual minutes per `issueRefKey` for the issue blocks saved on `date`, each
 * clipped to the viewer's local `[midnight, next midnight)` window.
 */
function actualsForDay(
  blocks: readonly DayBlock[],
  date: string,
  timezone: string,
): Map<string, number> {
  const actuals = new Map<string, number>();
  const start = zonedToInstant(date, 0, timezone);
  const end = zonedToInstant(addDaysISO(date, 1), 0, timezone);
  const now = Date.now();
  const seen = new Set<string>();

  for (const block of blocks) {
    if (block.kind !== "issue") continue;
    const org = block.org as string;
    const name = block.name as string;
    const issueNumber = block.issueNumber as number;
    const key = issueRefKey(org, name, issueNumber);
    if (seen.has(key)) continue;
    seen.add(key);

    const events = listIssueEvents(org, name, issueNumber);
    const intervals = activeIntervals(events, now, closedAtOf(org, name, issueNumber));
    actuals.set(key, clipMinutes(intervals, start, end));
  }
  return actuals;
}

/**
 * Compose one ALPEN day for `userId`: stored hours (or admin defaults), the
 * windows that apply, saved blocks, candidates, the clipped actual review and
 * whether a calendar feed token exists.
 */
export async function _dayView(userId: string, date: string): Promise<DayView> {
  const config = await getConfig();
  const hours = readWorkHours(userId) ?? hoursFromDefaults(config.planning.work_defaults);
  const windows = windowsForDate(listWindows(userId), date);
  const blocks = listDayBlocks(userId, date, date);
  const available = availableRanges(hours, date, windows);
  const availableCount = availableMinutes(hours, date, windows);
  const review = dayReview({ blocks, actualByKey: actualsForDay(blocks, date, hours.timezone) });

  return {
    date,
    label: dayLabel(date),
    weekday: weekdayOf(date),
    workHours: hours,
    startMinute: hours.startMinute,
    endMinute: hours.endMinute,
    windows,
    blocks,
    available,
    availableMinutes: availableCount,
    bufferMinutes: bufferMinutes(hours, availableCount),
    plannedMinutes: review.plannedMinutes,
    bufferPlannedMinutes: blocks
      .filter((block) => block.kind === "buffer")
      .reduce((total, block) => total + block.minutes, 0),
    candidates: listDayCandidates(userId, date),
    review,
    feedEnabled: readCalendarFeed(userId) !== null,
  };
}

export const load: PageServerLoad = async ({ locals, url }) => {
  const viewer = requireUser(locals, url);
  const config = await getConfig();
  const hours =
    readWorkHours(viewer.id) ?? hoursFromDefaults(config.planning.work_defaults);
  const today = localDateOf(Date.now(), hours.timezone);
  const date = parseDay(url.searchParams.get("day"), today);

  return {
    dayView: await _dayView(viewer.id, date),
    previous: addDaysISO(date, -1),
    next: addDaysISO(date, 1),
    today,
    user: viewer,
  };
};
