import { describe, expect, test } from "bun:test";
import {
	addDaysISO,
	formatClock,
	isDateISO,
	isValidTimeZone,
	localDateOf,
	parseClock,
	weekdayOf,
	zonedParts,
	zonedToInstant,
} from "./zoned";

const BERLIN = "Europe/Berlin";
const NEW_YORK = "America/New_York";

describe("time zones", () => {
	test("accepts IANA zones and rejects unknown ones", () => {
		expect(isValidTimeZone("UTC")).toBe(true);
		expect(isValidTimeZone(BERLIN)).toBe(true);
		expect(isValidTimeZone("Mars/Base")).toBe(false);
		expect(isValidTimeZone("")).toBe(false);
	});

	test("test_round_trip: Berlin 09:30 stays on the same local date", () => {
		const instant = zonedToInstant("2026-10-25", 9 * 60 + 30, BERLIN);

		expect(zonedParts(instant, BERLIN)).toEqual({
			year: 2026,
			month: 10,
			day: 25,
			hour: 9,
			minute: 30,
		});
		expect(localDateOf(instant, BERLIN)).toBe("2026-10-25");
	});

	test("test_dst: spring-forward gap clamps forward", () => {
		const instant = zonedToInstant("2026-03-08", 150, NEW_YORK);

		expect(instant).toBe(Date.UTC(2026, 2, 8, 7, 30));
		expect(zonedParts(instant, NEW_YORK)).toEqual({
			year: 2026,
			month: 3,
			day: 8,
			hour: 3,
			minute: 30,
		});
	});

	test("test_dst: fall-back overlap picks the earlier instant", () => {
		expect(zonedToInstant("2026-11-01", 90, NEW_YORK)).toBe(
			Date.UTC(2026, 10, 1, 5, 30),
		);
	});

	test("handles local midnight and end-of-day rollover", () => {
		expect(zonedToInstant("2026-10-25", 0, "UTC")).toBe(Date.UTC(2026, 9, 25, 0, 0));
		expect(zonedToInstant("2026-10-25", 1440, "UTC")).toBe(
			Date.UTC(2026, 9, 26, 0, 0),
		);
	});

	test("rejects impossible dates, out-of-range minutes and bad zones", () => {
		expect(() => zonedToInstant("2026-02-30", 60, "UTC")).toThrow();
		expect(() => zonedToInstant("2026-10-25", 1441, "UTC")).toThrow();
		expect(() => zonedToInstant("2026-10-25", 60, "Mars/Base")).toThrow();
	});
});

describe("local dates", () => {
	test("addDaysISO crosses months and years", () => {
		expect(addDaysISO("2026-10-25", 1)).toBe("2026-10-26");
		expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
		expect(addDaysISO("2026-03-01", -1)).toBe("2026-02-28");
		expect(addDaysISO("2026-10-25", 0)).toBe("2026-10-25");
	});

	test("weekdayOf counts ISO days from Monday", () => {
		expect(weekdayOf("2026-10-25")).toBe(7);
		expect(weekdayOf("2026-10-26")).toBe(1);
	});

	test("isDateISO accepts real dates only", () => {
		expect(isDateISO("2026-02-28")).toBe(true);
		expect(isDateISO("2024-02-29")).toBe(true);
		expect(isDateISO("2026-02-30")).toBe(false);
		expect(isDateISO("2026-2-3")).toBe(false);
		expect(isDateISO("")).toBe(false);
	});
});

describe("clock", () => {
	test("test_clock: parses and formats HH:MM", () => {
		expect(parseClock("9:05")).toBe(545);
		expect(parseClock("09:05")).toBe(545);
		expect(parseClock("24:00")).toBeNull();
		expect(parseClock("12:60")).toBeNull();
		expect(parseClock("abc")).toBeNull();
		expect(formatClock(545)).toBe("09:05");
		expect(formatClock(0)).toBe("00:00");
		expect(formatClock(1440)).toBe("24:00");
	});
});
