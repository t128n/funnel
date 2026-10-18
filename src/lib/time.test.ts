import { describe, expect, test } from "bun:test";
import { relativeTime } from "./time";

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

	test("falls back to an absolute date beyond a year", () => {
		expect(ago(400 * DAY)).toBe("2025-09-13");
	});
});
