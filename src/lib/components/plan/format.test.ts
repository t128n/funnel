import { describe, expect, test } from "bun:test";
import { capacityTone, dueLabel, weeksLabel } from "./format";

describe("capacityTone", () => {
	test("test_tone_thresholds", () => {
		expect(capacityTone(0, 360)).toBe("empty");
		expect(capacityTone(320, 360)).toBe("near");
		expect(capacityTone(400, 360)).toBe("over");
		expect(capacityTone(10, 0)).toBe("over");
	});

	test("zero cap with no work is empty", () => {
		expect(capacityTone(0, 0)).toBe("empty");
	});

	test("under the near threshold is empty", () => {
		expect(capacityTone(200, 360)).toBe("empty");
	});
});

describe("milestone date labels", () => {
	test("dueLabel formats UTC days", () => {
		expect(dueLabel(Date.UTC(2026, 10, 2))).toBe("2026-11-02");
		expect(dueLabel(null)).toBe("No due date");
	});

	test("weeksLabel explains the capacity window", () => {
		expect(weeksLabel(2)).toBe("2 weeks");
		expect(weeksLabel(1)).toBe("1 week");
		expect(weeksLabel(0)).toBe("0 weeks");
		expect(weeksLabel(null)).toBe("No due date");
	});
});
