import { describe, expect, test } from "bun:test";
import {
	addWeeks,
	cycleForWeek,
	isMondayISO,
	weekLabel,
	weekStartOf,
	weeksUntilDue,
} from "./calendar";

describe("weekStartOf", () => {
	test("maps any day of the week to its Monday in UTC", () => {
		expect(weekStartOf("2026-10-25")).toBe("2026-10-19");
		expect(weekStartOf("2026-10-19")).toBe("2026-10-19");
		expect(weekStartOf("2026-10-21")).toBe("2026-10-19");
	});

	test("uses the UTC day for Date inputs", () => {
		expect(weekStartOf(new Date("2026-10-25T23:59:59Z"))).toBe("2026-10-19");
		expect(weekStartOf(new Date("2026-10-26T00:00:00Z"))).toBe("2026-10-26");
	});

	test("crosses the year boundary", () => {
		expect(weekStartOf("2027-01-01")).toBe("2026-12-28");
	});
});

describe("addWeeks", () => {
	test("adds and subtracts whole weeks", () => {
		expect(addWeeks("2026-12-28", 1)).toBe("2027-01-04");
		expect(addWeeks("2026-10-19", 0)).toBe("2026-10-19");
		expect(addWeeks("2026-10-19", -1)).toBe("2026-10-12");
	});

	test("normalizes a non-Monday input to its week", () => {
		expect(addWeeks("2026-10-21", 1)).toBe("2026-10-26");
	});
});

describe("isMondayISO", () => {
	test("accepts real Mondays only", () => {
		expect(isMondayISO("2026-10-19")).toBe(true);
		expect(isMondayISO("2026-10-20")).toBe(false);
		expect(isMondayISO("2026-02-30")).toBe(false);
		expect(isMondayISO("19-10-2026")).toBe(false);
		expect(isMondayISO("")).toBe(false);
	});
});

describe("weekLabel", () => {
	test("renders a compact human label", () => {
		expect(weekLabel("2026-10-19")).toBe("19–25 Oct 2026");
		expect(weekLabel("2026-10-26")).toBe("26 Oct – 1 Nov 2026");
	});
});

describe("cycleForWeek", () => {
	test("returns the containing window", () => {
		expect(cycleForWeek("2026-10-19", "2024-01-01", 2)).toEqual({
			key: "2026-10-19",
			start: "2026-10-19",
			end: "2026-11-01",
			weeks: ["2026-10-19", "2026-10-26"],
		});
	});

	test("floors weeks before the anchor", () => {
		const cycle = cycleForWeek("2023-12-25", "2024-01-01", 2);
		expect(cycle.key).toBe("2023-12-18");
		expect(cycle.weeks).toEqual(["2023-12-18", "2023-12-25"]);
		expect(cycle.end).toBe("2023-12-31");
	});

	test("honours a single-week cycle", () => {
		expect(cycleForWeek("2026-10-21", "2024-01-01", 1)).toEqual({
			key: "2026-10-19",
			start: "2026-10-19",
			end: "2026-10-25",
			weeks: ["2026-10-19"],
		});
	});
});

describe("weeksUntilDue", () => {
	test("rounds partial weeks up", () => {
		expect(weeksUntilDue("2026-11-02", "2026-10-19")).toBe(2);
		expect(weeksUntilDue("2026-10-22", "2026-10-19")).toBe(1);
		expect(weeksUntilDue("2026-10-19", "2026-10-19")).toBe(0);
	});

	test("past due dates are zero", () => {
		expect(weeksUntilDue("2026-10-01", "2026-10-19")).toBe(0);
	});

	test("a missing due date has no window", () => {
		expect(weeksUntilDue(null, "2026-10-19")).toBeNull();
	});
});
