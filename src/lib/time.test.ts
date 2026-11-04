import { describe, expect, test } from "bun:test";
import { absoluteDate, absoluteDateTime, absoluteTime, relativeTime } from "./time";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-10-18T12:00:00Z");

/** Format `ms` milliseconds before {@link NOW}. */
function ago(ms: number): string {
	return relativeTime(NOW - ms, NOW);
}

describe("relativeTime", () => {
	test("formats sub-minute, minutes, and hours", () => {
		expect(ago(0)).toBe("just now");
		expect(ago(59_000)).toBe("just now");
		expect(ago(MINUTE)).toBe("1m ago");
		expect(ago(59 * MINUTE)).toBe("59m ago");
		expect(ago(HOUR)).toBe("1h ago");
		expect(ago(23 * HOUR)).toBe("23h ago");
	});

	test("uses days up to a week, then rolls into weeks", () => {
		expect(ago(DAY)).toBe("1d ago");
		expect(ago(6 * DAY)).toBe("6d ago");
		expect(ago(7 * DAY)).toBe("1w ago");
		expect(ago(20 * DAY)).toBe("2w ago");
	});

	test("falls back to the product's absolute date beyond a year", () => {
		expect(ago(400 * DAY)).toBe("13 Sep 2025");
	});
});

describe("absoluteDate", () => {
	test("formats a calendar date as day month year", () => {
		expect(absoluteDate("2026-11-02")).toBe("2 Nov 2026");
		expect(absoluteDate("2026-11-09")).toBe("9 Nov 2026");
	});

	test("returns malformed or invalid dates unchanged", () => {
		expect(absoluteDate("2026-02-30")).toBe("2026-02-30");
		expect(absoluteDate("2026-11-02T00:00:00Z")).toBe("2026-11-02T00:00:00Z");
		expect(absoluteDate("")).toBe("");
	});
});

describe("absolute timestamps", () => {
	// Build the instant from local parts so the expectation does not depend on
	// the machine's timezone.
	const local = new Date(2026, 10, 2, 7, 51, 37).getTime();

	test("absoluteDateTime shows minute precision in the product format", () => {
		expect(absoluteDateTime(local)).toBe("2 Nov 2026, 07:51");
	});

	test("absoluteTime adds seconds for precise title tooltips", () => {
		expect(absoluteTime(local)).toBe("2 Nov 2026, 07:51:37");
	});

	test("invalid timestamps format as an empty string", () => {
		expect(absoluteDateTime(Number.NaN)).toBe("");
		expect(absoluteTime(Number.NaN)).toBe("");
	});
});
