/**
 * ISO Monday weeks and planning cycles, in UTC only.
 *
 * A week is stored and exchanged as its Monday date in `YYYY-MM-DD` form
 * (SPEC §2). Every conversion below is pure and uses `Date.UTC`, so the server
 * and the client agree regardless of the host timezone. `Date` inputs are read
 * with their UTC fields, never local ones.
 */

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** One cycle of contiguous weeks anchored on {@link CycleWindow.start}. */
export interface CycleWindow {
	/** The first Monday of the cycle (`YYYY-MM-DD`). */
	key: string;
	/** First Monday (`YYYY-MM-DD`), same as {@link key}. */
	start: string;
	/** Last Sunday (`YYYY-MM-DD`). */
	end: string;
	/** Contiguous Monday dates, in order. */
	weeks: string[];
}

/** Pad a 1-based calendar component to two digits. */
function pad(value: number): string {
	return String(value).padStart(2, "0");
}

/** Format a UTC-midnight timestamp as `YYYY-MM-DD`. */
function isoOf(ms: number): string {
	const date = new Date(ms);
	return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Parse a `YYYY-MM-DD` date into a UTC-midnight timestamp, or `NaN`. */
function msOf(value: string): number {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return Number.NaN;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const ms = Date.UTC(year, month - 1, day);
	const date = new Date(ms);
	// Reject impossible dates such as 2026-02-30, which Date.UTC rolls over.
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	) {
		return Number.NaN;
	}
	return ms;
}

/** UTC-midnight timestamp for a `Date` or ISO date string. */
function midnightOf(input: Date | string): number {
	if (typeof input === "string") return msOf(input);
	return Date.UTC(
		input.getUTCFullYear(),
		input.getUTCMonth(),
		input.getUTCDate(),
	);
}

/**
 * The Monday of the week containing `input`, as `YYYY-MM-DD`.
 *
 * Sunday belongs to the week that started six days earlier; Monday is its own
 * week start. `Date` inputs use their UTC calendar day.
 */
export function weekStartOf(input: Date | string): string {
	const ms = midnightOf(input);
	if (Number.isNaN(ms)) return input instanceof Date ? "Invalid Date" : input;
	const day = new Date(ms).getUTCDay();
	const offset = (day + 6) % 7; // Monday -> 0 … Sunday -> 6
	return isoOf(ms - offset * DAY_MS);
}

/**
 * Shift a week by whole weeks. Non-Monday inputs are normalized to their week
 * first, and the result is always a Monday.
 */
export function addWeeks(week: string, weeks: number): string {
	return isoOf(midnightOf(weekStartOf(week)) + Math.trunc(weeks) * WEEK_MS);
}

/** True when `value` is a real calendar date that falls on a Monday. */
export function isMondayISO(value: string): boolean {
	const ms = msOf(value);
	if (Number.isNaN(ms)) return false;
	return new Date(ms).getUTCDay() === 1;
}

/**
 * A compact human label for a week, e.g. `19–25 Oct 2026` or
 * `26 Oct – 1 Nov 2026`. Years are repeated when the week straddles one.
 * An unusable input is echoed back rather than rendered as `NaN`.
 */
export function weekLabel(week: string): string {
	const start = midnightOf(weekStartOf(week));
	if (Number.isNaN(start)) return week;
	const end = start + 6 * DAY_MS;
	const startDate = new Date(start);
	const endDate = new Date(end);
	const startMonth = MONTHS[startDate.getUTCMonth()];
	const endMonth = MONTHS[endDate.getUTCMonth()];
	const startDay = startDate.getUTCDate();
	const endDay = endDate.getUTCDate();
	const startYear = startDate.getUTCFullYear();
	const endYear = endDate.getUTCFullYear();

	if (startYear !== endYear) {
		return `${startDay} ${startMonth} ${startYear} – ${endDay} ${endMonth} ${endYear}`;
	}
	if (startMonth !== endMonth) {
		return `${startDay} ${startMonth} – ${endDay} ${endMonth} ${startYear}`;
	}
	return `${startDay}–${endDay} ${startMonth} ${startYear}`;
}

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
] as const;

/**
 * The cycle containing `week`.
 *
 * Cycles are `cycleWeeks` contiguous weeks counted from `anchor`; the key is
 * the first Monday. Weeks before the anchor floor into negative cycles rather
 * than clamping to the anchor, so historical plans keep stable windows.
 */
export function cycleForWeek(
	week: string,
	anchor: string,
	cycleWeeks: number,
): CycleWindow {
	const length = Math.max(1, Math.trunc(cycleWeeks));
	const weekMs = midnightOf(weekStartOf(week));
	const anchorMs = midnightOf(weekStartOf(anchor));
	const diffWeeks = Math.round((weekMs - anchorMs) / WEEK_MS);
	const index = Math.floor(diffWeeks / length);
	const start = addWeeks(weekStartOf(anchor), index * length);
	const weeks = Array.from({ length }, (_, offset) => addWeeks(start, offset));
	const end = isoOf(midnightOf(weeks[weeks.length - 1]!) + 6 * DAY_MS);

	return { key: start, start, end, weeks };
}

/**
 * Weekly capacity windows from `now` until `dueOn`, rounded up with a minimum
 * of zero. A due date in the past yields `0`; a missing due date yields
 * `null`, which callers render without a cap.
 */
export function weeksUntilDue(
	dueOn: string | null | undefined,
	now: Date | string,
): number | null {
	if (dueOn === null || dueOn === undefined) return null;
	const due = midnightOf(dueOn);
	if (Number.isNaN(due)) return null;
	const today = midnightOf(now);
	const days = Math.round((due - today) / DAY_MS);
	return Math.max(0, Math.ceil(days / 7));
}
