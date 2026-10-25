import { describe, expect, test } from "bun:test";
import {
	DEFAULT_WORK_HOURS,
	WorkHoursError,
	availableMinutes,
	availableRanges,
	bufferMinutes,
	clipMinutes,
	clipRanges,
	defaultsFromHours,
	hoursFromDefaults,
	issueRefKey,
	mergeRanges,
	minutesInRanges,
	normalizeWorkHours,
	windowsForDate,
} from "./availability";
import type { DayWindow, WorkDefaultsInput, WorkHours } from "./availability";

const HOURS: WorkHours = {
	timezone: "UTC",
	startMinute: 540,
	endMinute: 1020,
	workDays: [1, 2, 3, 4, 5],
	bufferPercent: 20,
};

const DEFAULT_INPUT: WorkDefaultsInput = {
	timezone: "UTC",
	start_minute: 540,
	end_minute: 1020,
	work_days: [1, 2, 3, 4, 5],
	buffer_percent: 20,
};

function window(overrides: Partial<DayWindow> = {}): DayWindow {
	return {
		label: "Lunch",
		weekday: null,
		date: "2026-10-26",
		startMinute: 720,
		endMinute: 780,
		...overrides,
	};
}

describe("ranges", () => {
	test("merges overlapping and adjacent ranges in order", () => {
		expect(
			mergeRanges([
				{ start: 780, end: 1020 },
				{ start: 540, end: 720 },
				{ start: 700, end: 760 },
				{ start: 1020, end: 1080 },
			]),
		).toEqual([
			{ start: 540, end: 760 },
			{ start: 780, end: 1080 },
		]);
	});

	test("counts minutes across ranges", () => {
		expect(
			minutesInRanges([
				{ start: 540, end: 720 },
				{ start: 780, end: 1020 },
			]),
		).toBe(420);
		expect(minutesInRanges([])).toBe(0);
	});

	test("clips ranges to a window", () => {
		expect(
			clipRanges(
				[
					{ start: 480, end: 600 },
					{ start: 700, end: 800 },
					{ start: 1000, end: 1100 },
				],
				540,
				1020,
			),
		).toEqual([
			{ start: 540, end: 600 },
			{ start: 700, end: 800 },
			{ start: 1000, end: 1020 },
		]);
		expect(clipRanges([{ start: 0, end: 1440 }], 600, 600)).toEqual([]);
	});
});

describe("availability", () => {
	test("test_lunch: subtracts a one-off window from the work window", () => {
		expect(availableRanges(HOURS, "2026-10-26", [window()])).toEqual([
			{ start: 540, end: 720 },
			{ start: 780, end: 1020 },
		]);
		expect(availableMinutes(HOURS, "2026-10-26", [window()])).toBe(420);
	});

	test("subtracts recurring weekday windows", () => {
		const recurring = window({ weekday: 1, date: null });

		expect(availableRanges(HOURS, "2026-10-26", [recurring])).toEqual([
			{ start: 540, end: 720 },
			{ start: 780, end: 1020 },
		]);
		expect(availableRanges(HOURS, "2026-10-27", [recurring])).toEqual([
			{ start: 540, end: 1020 },
		]);
	});

	test("test_lunch: Sunday is not a work day", () => {
		expect(availableRanges(HOURS, "2026-10-25", [])).toEqual([]);
		expect(availableMinutes(HOURS, "2026-10-25", [])).toBe(0);
	});

	test("ignores windows that do not apply to the date", () => {
		expect(availableRanges(HOURS, "2026-10-26", [window({ date: "2026-10-27" })])).toEqual([
			{ start: 540, end: 1020 },
		]);
	});

	test("windowsForDate keeps only the recurring and one-off windows for that day", () => {
		const monday = window({ label: "Lunch", weekday: 1, date: null });
		const tuesday = window({ label: "School", weekday: 2, date: null });
		const dated = window({ label: "Dentist", weekday: null, date: "2026-10-26" });
		const otherDate = window({ label: "Elsewhere", weekday: null, date: "2026-10-27" });

		expect(windowsForDate([monday, tuesday, dated, otherDate], "2026-10-26")).toEqual([
			monday,
			dated,
		]);
		expect(windowsForDate([monday], "2026-02-30")).toEqual([]);
	});

	test("test_buffer: reserves a rounded share of the available minutes", () => {
		expect(bufferMinutes(HOURS, 480)).toBe(96);
		expect(bufferMinutes(HOURS, 0)).toBe(0);
	});

	test("clipMinutes counts actual time inside an instant span", () => {
		const dayStart = Date.UTC(2026, 9, 26, 0, 0);
		const dayEnd = Date.UTC(2026, 9, 27, 0, 0);
		const intervals = [
			{ start: Date.UTC(2026, 9, 25, 23, 0), end: Date.UTC(2026, 9, 26, 1, 0) },
			{ start: Date.UTC(2026, 9, 26, 9, 0), end: Date.UTC(2026, 9, 26, 10, 30) },
		];

		expect(clipMinutes(intervals, dayStart, dayEnd)).toBe(150);
		expect(clipMinutes([], dayStart, dayEnd)).toBe(0);
	});
});

describe("work hours", () => {
	test("defaults match the spec exactly", () => {
		expect(DEFAULT_WORK_HOURS).toEqual({
			timezone: "UTC",
			startMinute: 540,
			endMinute: 1020,
			workDays: [1, 2, 3, 4, 5],
			bufferPercent: 20,
		});
	});

	test("normalizes the snake_case wire shape", () => {
		expect(normalizeWorkHours(DEFAULT_INPUT)).toEqual(HOURS);
		expect(normalizeWorkHours({ ...DEFAULT_INPUT, work_days: [7, 1, 5] })).toEqual({
			...HOURS,
			workDays: [1, 5, 7],
		});
	});

	test("test_invalid: bad bounds, zone, percent or days throw", () => {
		const cases: WorkDefaultsInput[] = [
			{ ...DEFAULT_INPUT, start_minute: 1020 },
			{ ...DEFAULT_INPUT, start_minute: 1080, end_minute: 1020 },
			{ ...DEFAULT_INPUT, timezone: "Mars/Base" },
			{ ...DEFAULT_INPUT, buffer_percent: 91 },
			{ ...DEFAULT_INPUT, buffer_percent: -1 },
			{ ...DEFAULT_INPUT, work_days: [] },
			{ ...DEFAULT_INPUT, work_days: [1, 1] },
			{ ...DEFAULT_INPUT, work_days: [0, 1] },
			{ ...DEFAULT_INPUT, start_minute: 0.5 },
		];

		for (const input of cases) {
			expect(() => normalizeWorkHours(input)).toThrow(WorkHoursError);
		}
	});

	test("round-trips hours through the wire shape", () => {
		expect(hoursFromDefaults(DEFAULT_INPUT)).toEqual(HOURS);
		expect(defaultsFromHours(HOURS)).toEqual(DEFAULT_INPUT);
	});

	test("issueRefKey joins org, name and number", () => {
		expect(issueRefKey("orgA", "core", 12)).toBe("orgA/core#12");
	});
});
