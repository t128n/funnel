/**
 * `/plan` load (SPEC §5, §7).
 *
 * One read page with four horizons: a single Monday week, the configured cycle
 * around it, the read-only milestone capacity view, and the viewer's ALPEN day.
 * Every horizon returns the same week vocabulary — lanes, unassigned work,
 * unestimated issues and the scheduling candidate list — plus the day view, so
 * the page can switch tabs without a second data path.
 *
 * Query parameters are defensive: an unknown `horizon` falls back to `week`,
 * a `week`/`cycle` that is not a real Monday falls back to the current week and
 * its cycle, and a malformed `day` falls back to the viewer-local today in
 * their effective working-hours timezone. Navigation targets are resolved here
 * so the browser bundle never imports the server calendar module.
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
  addWeeks,
  cycleForWeek,
  isMondayISO,
  weekStartOf,
} from "#lib/server/planning/calendar";
import { milestonePlans } from "#lib/server/planning/milestones";
import { cyclePlan, weekPlan } from "#lib/server/planning/plans";
import { listPlanCandidates } from "#lib/server/planning/queries";
import {
  addDaysISO,
  isDateISO,
  localDateOf,
  weekdayOf,
  zonedToInstant,
} from "#lib/time/zoned";
import type { PageServerLoad } from "./$types";

/** The four planning horizons exposed by `/plan`. */
export type PlanHorizon = "week" | "cycle" | "milestone" | "day";

/**
 * One viewer's day: effective hours, the saved plan, actuals clipped to the
 * local day, ordered candidates and the read-only feed flag (SPEC §7).
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

function parseHorizon(raw: string | null): PlanHorizon {
  if (raw === "cycle" || raw === "milestone" || raw === "day") return raw;
  return "week";
}

/** A Monday query parameter, or `fallback` when absent or malformed. */
function parseWeek(raw: string | null, fallback: string): string {
  return raw !== null && isMondayISO(raw) ? raw : fallback;
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
 * clipped to the viewer's local `[midnight, next midnight)` window. An interval
 * that spans midnight therefore counts only its overlap with this day.
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
export async function dayView(userId: string, date: string): Promise<DayView> {
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
  const planning = config.planning;
  const horizon = parseHorizon(url.searchParams.get("horizon"));

  const week = parseWeek(url.searchParams.get("week"), weekStartOf(new Date()));
  const cycle = cycleForWeek(
    parseWeek(url.searchParams.get("cycle"), week),
    planning.cycle_anchor,
    planning.cycle_weeks,
  ).key;

  const viewerHours = readWorkHours(viewer.id) ?? hoursFromDefaults(planning.work_defaults);
  const dayDate = parseDay(
    url.searchParams.get("day"),
    localDateOf(Date.now(), viewerHours.timezone),
  );

  const [weekView, cycleView, milestones, day] = await Promise.all([
    weekPlan(week),
    cyclePlan(cycle),
    milestonePlans(),
    dayView(viewer.id, dayDate),
  ] as const);

  const previous =
    horizon === "week"
      ? addWeeks(week, -1)
      : horizon === "cycle"
        ? addWeeks(cycle, -planning.cycle_weeks)
        : horizon === "day"
          ? addDaysISO(day.date, -1)
          : null;
  const next =
    horizon === "week"
      ? addWeeks(week, 1)
      : horizon === "cycle"
        ? addWeeks(cycle, planning.cycle_weeks)
        : horizon === "day"
          ? addDaysISO(day.date, 1)
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
    dayView: day,
  };
};
