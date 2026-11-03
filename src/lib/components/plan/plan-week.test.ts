import { describe, expect, test } from "bun:test";
import {
	mondayOf,
	planBlockMessage,
	planEligibility,
	planWeekOptions,
	shiftWeek
} from "./plan-week";

const NOW = new Date("2026-11-04T12:00:00Z"); // Wednesday of the 2 Nov week

describe("plan week helpers", () => {
	test("mondayOf uses the UTC Monday", () => {
		expect(mondayOf(NOW)).toBe("2026-11-02");
		expect(mondayOf(new Date("2026-11-08T23:59:00Z"))).toBe("2026-11-02");
		expect(mondayOf(new Date("2026-11-09T00:00:00Z"))).toBe("2026-11-09");
	});

	test("shiftWeek crosses month boundaries", () => {
		expect(shiftWeek("2026-11-02", 1)).toBe("2026-11-09");
		expect(shiftWeek("2026-10-26", 1)).toBe("2026-11-02");
		expect(shiftWeek("2026-11-02", -2)).toBe("2026-10-19");
	});

	test("offers relative labels and keeps the current week", () => {
		const options = planWeekOptions("2026-11-02", NOW);
		expect(options[2]).toEqual({ value: "2026-11-02", label: "This week · 2 Nov" });
		expect(options[3]).toEqual({ value: "2026-11-09", label: "Next week · 9 Nov" });
		expect(options[4]?.label).toBe("In 2 weeks · 16 Nov");

		const old = planWeekOptions("2026-01-05", NOW);
		expect(old[0]).toEqual({ value: "2026-01-05", label: "Week of 5 Jan 2026" });
	});
});

describe("plan eligibility", () => {
	const dana = {
		externalId: "1",
		forge: "github",
		instance: "github.com",
		login: "dana",
		avatarUrl: ""
	};
	const base = {
		state: "open",
		size: "md" as string | null,
		assignees: [dana]
	};

	const danaKey = "github:github.com:1";

	test("open, sized and maintained is schedulable", () => {
		expect(planEligibility(base, [danaKey])).toEqual({
			schedulable: true,
			reason: null
		});
	});

	test("closed, unsized and unowned are blocked with a reason", () => {
		expect(planEligibility({ ...base, state: "closed" }, [danaKey])).toEqual({
			schedulable: false,
			reason: "closed"
		});
		expect(planEligibility({ ...base, size: null }, [danaKey])).toEqual({
			schedulable: false,
			reason: "unestimated"
		});
		expect(planEligibility(base, ["github:github.com:2"])).toEqual({
			schedulable: false,
			reason: "unowned"
		});
	});

	test("block messages are actionable", () => {
		expect(planBlockMessage("closed")).toContain("Closed issues");
		expect(planBlockMessage("unestimated")).toContain("Add a size");
		expect(planBlockMessage("unowned")).toContain("active maintainer");
		expect(planBlockMessage(null)).toBeNull();
	});
});
