import { describe, expect, test } from "bun:test";
import { capacityTone, dayHeadline, weekHeadline } from "./format";

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

describe("period labels", () => {
	test("weekHeadline names the Monday week", () => {
		expect(weekHeadline("2026-11-02")).toBe("Week of 2 Nov 2026");
		expect(weekHeadline("2026-02-30")).toBe("2026-02-30");
	});

	test("dayHeadline names the weekday and date", () => {
		expect(dayHeadline("2026-11-02")).toBe("Day: Monday 2 Nov");
		expect(dayHeadline("nope")).toBe("Day");
	});
});
