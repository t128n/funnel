import { describe, expect, test } from "bun:test";
import {
	barPercent,
	formatMinutes,
	hoursToMinutes,
	minutesToHours,
} from "./planning";

describe("minutesToHours", () => {
	test("converts whole and fractional hours", () => {
		expect(minutesToHours(120)).toBe(2);
		expect(minutesToHours(450)).toBe(7.5);
		expect(minutesToHours(90)).toBe(1.5);
	});

	test("rounds to two decimals", () => {
		expect(minutesToHours(100)).toBe(1.67);
	});
});

describe("hoursToMinutes", () => {
	test("test_hours_round_trip", () => {
		expect(hoursToMinutes(7.5)).toBe(450);
		expect(hoursToMinutes(0.1)).toBe(6);
		expect(hoursToMinutes(2)).toBe(120);
		expect(minutesToHours(hoursToMinutes(7.5))).toBe(7.5);
		expect(minutesToHours(hoursToMinutes(40))).toBe(40);
	});
});

describe("formatMinutes", () => {
	test("test_format_minutes", () => {
		expect(formatMinutes(120)).toBe("2h");
		expect(formatMinutes(90)).toBe("1h 30m");
		expect(formatMinutes(30)).toBe("30m");
		expect(formatMinutes(0)).toBe("0m");
		expect(formatMinutes(null)).toBe("—");
		expect(formatMinutes(undefined)).toBe("—");
	});
});

describe("barPercent", () => {
	test("test_bar_clamps", () => {
		expect(barPercent(480, 360)).toBe(100);
		expect(barPercent(180, 360)).toBe(50);
		expect(barPercent(0, 360)).toBe(0);
	});

	test("a zero cap is full only when work exists", () => {
		expect(barPercent(0, 0)).toBe(0);
		expect(barPercent(10, 0)).toBe(100);
	});
});
