/**
 * Working hours and unavailable windows for the ALPEN day planner.
 *
 * Everything here is pure and client-safe. Minutes are integers from local
 * midnight; ranges are half-open `[start, end)`. The snake_case
 * {@link WorkDefaultsInput} is the settings/API wire shape, while
 * {@link WorkHours} is the internal camelCase shape shared with the rest of
 * the app.
 */
import { isDateISO, isValidTimeZone, weekdayOf } from "../time/zoned";

/** A half-open interval of local minutes `[start, end)`. */
export interface MinuteRange {
	start: number;
	end: number;
}

/** An unix-millisecond interval, used for clipped actuals. */
export interface TimeSpan {
	start: number;
	end: number;
}

/** Effective working hours for one viewer. */
export interface WorkHours {
	timezone: string;
	startMinute: number;
	endMinute: number;
	/** ISO weekdays, Monday 1 … Sunday 7. */
	workDays: number[];
	/** Reserved share of the work window, `0..90`. */
	bufferPercent: number;
}

/** One recurring (`weekday`) or one-off (`date`) blocked window. */
export interface DayWindow {
	label: string;
	weekday: number | null;
	date: string | null;
	startMinute: number;
	endMinute: number;
}

/** Admin defaults / API payload in the persisted snake_case shape. */
export interface WorkDefaultsInput {
	timezone: string;
	start_minute: number;
	end_minute: number;
	work_days: number[];
	buffer_percent: number;
}

/** The spec's default working hours. */
export const DEFAULT_WORK_HOURS: WorkHours = {
	timezone: "UTC",
	startMinute: 540,
	endMinute: 1020,
	workDays: [1, 2, 3, 4, 5],
	bufferPercent: 20,
};

/** Raised when working hours fail validation. */
export class WorkHoursError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkHoursError";
	}
}

/** Sort, merge and drop empty ranges. Input is never mutated. */
export function mergeRanges(ranges: readonly MinuteRange[]): MinuteRange[] {
	const sorted = ranges
		.filter((range) => range.end > range.start)
		.map((range) => ({ start: range.start, end: range.end }))
		.sort((a, b) => a.start - b.start || a.end - b.end);

	const merged: MinuteRange[] = [];
	for (const range of sorted) {
		const last = merged[merged.length - 1];
		if (last && range.start <= last.end) {
			last.end = Math.max(last.end, range.end);
		} else {
			merged.push(range);
		}
	}
	return merged;
}

/** Total minutes covered by `ranges`. */
export function minutesInRanges(ranges: readonly MinuteRange[]): number {
	return ranges.reduce((total, range) => total + Math.max(0, range.end - range.start), 0);
}

/** Intersect `ranges` with `[start, end)`, merged and ascending. */
export function clipRanges(
	ranges: readonly MinuteRange[],
	start: number,
	end: number,
): MinuteRange[] {
	if (end <= start) return [];

	const clipped: MinuteRange[] = [];
	for (const range of ranges) {
		const from = Math.max(range.start, start);
		const to = Math.min(range.end, end);
		if (to > from) clipped.push({ start: from, end: to });
	}
	return mergeRanges(clipped);
}

/** Remove `cut` from each range, splitting where it lands inside. */
function subtractRange(ranges: readonly MinuteRange[], cut: MinuteRange): MinuteRange[] {
	const result: MinuteRange[] = [];
	for (const range of ranges) {
		if (cut.end <= range.start || cut.start >= range.end) {
			result.push({ start: range.start, end: range.end });
			continue;
		}
		if (cut.start > range.start) {
			result.push({ start: range.start, end: cut.start });
		}
		if (cut.end < range.end) {
			result.push({ start: cut.end, end: range.end });
		}
	}
	return result;
}

function appliesTo(window: DayWindow, date: string, weekday: number): boolean {
	if (window.weekday !== null) return window.weekday === weekday;
	if (window.date !== null) return window.date === date;
	return false;
}

/** The unavailable windows that apply to `date`, in the input order. */
export function windowsForDate(
	windows: readonly DayWindow[],
	date: string,
): DayWindow[] {
	if (!isDateISO(date)) return [];
	const weekday = weekdayOf(date);
	return windows.filter((window) => appliesTo(window, date, weekday));
}

/**
 * The work window on `date` minus every unavailable window that applies to
 * it. A non-work day yields no ranges.
 */
export function availableRanges(
	hours: WorkHours,
	date: string,
	windows: readonly DayWindow[],
): MinuteRange[] {
	if (!isDateISO(date)) return [];

	const weekday = weekdayOf(date);
	if (!hours.workDays.includes(weekday)) return [];

	const cuts = mergeRanges(
		windowsForDate(windows, date).map((window) => ({
			start: window.startMinute,
			end: window.endMinute,
		})),
	);

	let ranges: MinuteRange[] = [{ start: hours.startMinute, end: hours.endMinute }];
	for (const cut of cuts) {
		ranges = subtractRange(ranges, cut);
	}
	return clipRanges(ranges, hours.startMinute, hours.endMinute);
}

/** Total available minutes on `date`. */
export function availableMinutes(
	hours: WorkHours,
	date: string,
	windows: readonly DayWindow[],
): number {
	return minutesInRanges(availableRanges(hours, date, windows));
}

/** The reserved buffer: a rounded share of the available minutes. */
export function bufferMinutes(hours: WorkHours, available: number): number {
	if (available <= 0) return 0;
	return Math.round((available * hours.bufferPercent) / 100);
}

/** Total whole minutes of `intervals` that fall inside `[start, end)`. */
export function clipMinutes(
	intervals: readonly TimeSpan[],
	start: number,
	end: number,
): number {
	if (end <= start) return 0;

	let total = 0;
	for (const interval of intervals) {
		total += Math.max(0, Math.min(interval.end, end) - Math.max(interval.start, start));
	}
	return Math.round(total / 60_000);
}

function requireInteger(value: unknown, field: string, min: number, max: number): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
		throw new WorkHoursError(`${field} must be an integer between ${min} and ${max}`);
	}
	return value;
}

/**
 * Validate and normalize the snake_case wire shape into {@link WorkHours}.
 * Throws {@link WorkHoursError} for bad bounds, unknown zones, duplicate or
 * empty work days, or a buffer outside `0..90`.
 */
export function normalizeWorkHours(input: WorkDefaultsInput): WorkHours {
	if (!input || typeof input !== "object") {
		throw new WorkHoursError("Working hours are required");
	}

	const timezone = input.timezone;
	if (typeof timezone !== "string" || timezone.trim() === "") {
		throw new WorkHoursError("timezone is required");
	}

	const startMinute = requireInteger(input.start_minute, "start_minute", 0, 1440);
	const endMinute = requireInteger(input.end_minute, "end_minute", 0, 1440);
	if (startMinute >= endMinute) {
		throw new WorkHoursError("start_minute must be less than end_minute");
	}

	const days = input.work_days;
	if (!Array.isArray(days) || days.length === 0) {
		throw new WorkHoursError("work_days must not be empty");
	}
	const workDays: number[] = [];
	for (const day of days) {
		if (!Number.isInteger(day) || day < 1 || day > 7) {
			throw new WorkHoursError("work_days must be ISO weekdays between 1 and 7");
		}
		if (workDays.includes(day)) {
			throw new WorkHoursError("work_days must not contain duplicates");
		}
		workDays.push(day);
	}
	workDays.sort((a, b) => a - b);

	const bufferPercent = requireInteger(input.buffer_percent, "buffer_percent", 0, 90);

	const hours: WorkHours = {
		timezone,
		startMinute,
		endMinute,
		workDays,
		bufferPercent,
	};

	if (!isValidTimeZone(hours.timezone)) {
		throw new WorkHoursError(`Unknown timezone: ${hours.timezone}`);
	}
	return hours;
}

/** Admin defaults (snake_case) → effective hours. */
export function hoursFromDefaults(input: WorkDefaultsInput): WorkHours {
	return normalizeWorkHours(input);
}

/** Effective hours → admin defaults (snake_case). */
export function defaultsFromHours(hours: WorkHours): WorkDefaultsInput {
	return {
		timezone: hours.timezone,
		start_minute: hours.startMinute,
		end_minute: hours.endMinute,
		work_days: [...hours.workDays],
		buffer_percent: hours.bufferPercent,
	};
}

/** Stable key for an issue reference: `org/name#number`. */
export function issueRefKey(org: string, name: string, number: number): string {
	return `${org}/${name}#${number}`;
}
