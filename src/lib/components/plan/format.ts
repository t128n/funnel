/**
 * Presentation helpers for the planner.
 *
 * Pure and dependency-free so the Svelte components and bun tests share one
 * definition of the capacity thresholds.
 */

/** How a lane's committed load compares with its cap. */
export type CapacityTone = "empty" | "near" | "over";

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

const WEEKDAYS = [
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
	"Sunday",
] as const;

interface CalendarDay {
	year: number;
	month: number;
	day: number;
}

/** Parse a `YYYY-MM-DD` date into its UTC calendar parts. */
function calendarDay(value: string): CalendarDay | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const ms = Date.UTC(year, month - 1, day);
	const date = new Date(ms);
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	) {
		return null;
	}
	return { year, month, day };
}

/** `2026-11-02` → `Week of 2 Nov 2026`. */
export function weekHeadline(week: string): string {
	const date = calendarDay(week);
	if (date === null) return week;
	return `Week of ${date.day} ${MONTHS[date.month - 1]} ${date.year}`;
}

/** ISO-8601 week number and week-year for a `YYYY-MM-DD` date. */
function isoWeek(value: string): { year: number; week: number } | null {
	const date = calendarDay(value);
	if (date === null) return null;
	const utc = new Date(Date.UTC(date.year, date.month - 1, date.day));
	const day = utc.getUTCDay() || 7;
	utc.setUTCDate(utc.getUTCDate() + 4 - day);
	const year = utc.getUTCFullYear();
	const yearStart = Date.UTC(year, 0, 1);
	const week = Math.ceil(((utc.getTime() - yearStart) / 86_400_000 + 1) / 7);
	return { year, week };
}

/** `2026-11-02` → `Cycle 2026-W45`. */
export function cycleHeadline(cycleStart: string): string {
	const iso = isoWeek(cycleStart);
	if (iso === null) return `Cycle ${cycleStart}`;
	return `Cycle ${iso.year}-W${String(iso.week).padStart(2, "0")}`;
}

/** `2026-11-02` → `Day: Monday 2 Nov`. */
export function dayHeadline(date: string): string {
	const parsed = calendarDay(date);
	if (parsed === null) return "Day";
	const weekdayIndex = new Date(
		Date.UTC(parsed.year, parsed.month - 1, parsed.day),
	).getUTCDay();
	const weekday = WEEKDAYS[(weekdayIndex + 6) % 7];
	return `Day: ${weekday} ${parsed.day} ${MONTHS[parsed.month - 1]}`;
}

/**
 * Traffic-light tone for a capacity meter.
 *
 * A zero cap is empty until work exists, then over. Work above the cap is over;
 * from 80% of the cap upward is near. The cap already includes allocation, so
 * there is no separate allocation line to leave room for.
 */
export function capacityTone(
	committedMinutes: number,
	capMinutes: number,
): CapacityTone {
	if (!Number.isFinite(committedMinutes) || committedMinutes <= 0) {
		return "empty";
	}
	if (capMinutes <= 0) return "over";
	if (committedMinutes > capMinutes) return "over";
	if (committedMinutes / capMinutes >= 0.8) return "near";
	return "empty";
}

/** Format a milestone due date (`YYYY-MM-DD` in UTC), or its absence. */
export function dueLabel(dueOn: number | null | undefined): string {
	if (dueOn === null || dueOn === undefined || !Number.isFinite(dueOn)) {
		return "No due date";
	}
	return new Date(dueOn).toISOString().slice(0, 10);
}

/** Describe the milestone capacity window without implying a cap when absent. */
export function weeksLabel(capacityWeeks: number | null | undefined): string {
	if (capacityWeeks === null || capacityWeeks === undefined) {
		return "No due date";
	}
	return `${capacityWeeks} ${capacityWeeks === 1 ? "week" : "weeks"}`;
}

/**
 * A milestone's lane cap. Without a due date there is no capacity window, so
 * the lane has no cap and the bar shows committed hours only.
 */
export function milestoneCap(
	capacityWeeks: number | null,
	capMinutes: number,
): number | null {
	return capacityWeeks === null ? null : capMinutes;
}
