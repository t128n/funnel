import { describe, expect, test } from "bun:test";
import {
	capMinutes,
	distributeIssues,
	estimateMinutes,
	maintainerKey,
	overCapacity,
	splitMinutes,
	type CapacityIssue,
	type CapacityMaintainer,
} from "./capacity";

const SIZES = { sm: 120, md: 240, lg: 480 };

function person(
	login: string,
	overrides: Partial<CapacityMaintainer> = {},
): CapacityMaintainer {
	return {
		forge: "github",
		instance: "github.com",
		externalId: login,
		login,
		avatarUrl: null,
		weeklyMinutes: 600,
		active: true,
		...overrides,
	};
}

const ann = person("ann");

function key(login: string): string {
	return maintainerKey(person(login));
}

describe("estimateMinutes", () => {
	test("maps size labels through the configured map", () => {
		expect(estimateMinutes("md", SIZES)).toBe(240);
		expect(estimateMinutes("sm", SIZES)).toBe(120);
	});

	test("unestimated issues have a null estimate", () => {
		expect(estimateMinutes(null, SIZES)).toBeNull();
		expect(estimateMinutes(undefined, SIZES)).toBeNull();
		expect(estimateMinutes("xl", SIZES)).toBeNull();
	});
});

describe("capMinutes", () => {
	test("floors the percentage", () => {
		expect(capMinutes(599, 60, 1)).toBe(359);
		expect(capMinutes(600, 60, 2)).toBe(720);
	});

	test("a null window has no capacity", () => {
		expect(capMinutes(600, 60, null)).toBe(0);
	});

	test("zero weeks has no capacity", () => {
		expect(capMinutes(600, 60, 0)).toBe(0);
	});
});

describe("splitMinutes", () => {
	test("puts the integer remainder on the first share", () => {
		expect(splitMinutes(241, 2)).toEqual([121, 120]);
		expect(splitMinutes(240, 2)).toEqual([120, 120]);
		expect(splitMinutes(100, 3)).toEqual([34, 33, 33]);
	});

	test("degenerate part counts produce no shares", () => {
		expect(splitMinutes(100, 0)).toEqual([]);
		expect(splitMinutes(0, 2)).toEqual([0, 0]);
	});
});

describe("maintainerKey", () => {
	test("is unique per forge identity", () => {
		expect(maintainerKey(ann)).toBe("github:github.com:ann");
		expect(maintainerKey(person("ann", { instance: "ghe.example" }))).not.toBe(
			maintainerKey(ann),
		);
	});
});

describe("distributeIssues", () => {
	test("splits an issue across its active assignees", () => {
		const bob = person("bob");
		const issues: CapacityIssue[] = [
			{ estimateMinutes: 241, assignees: [key("ann"), key("bob")] },
		];
		const result = distributeIssues(issues, [ann, bob]);

		expect(result.totals.map((lane) => lane.committedMinutes)).toEqual([
			121, 120,
		]);
		expect(result.totals.map((lane) => lane.issueIndexes)).toEqual([
			[0],
			[0],
		]);
		expect(result.unassigned.committedMinutes).toBe(0);
	});

	test("leaves inactive maintainers unassigned", () => {
		const inactive = person("ann", { active: false });
		const issues: CapacityIssue[] = [
			{ estimateMinutes: 240, assignees: [maintainerKey(inactive)] },
		];
		const result = distributeIssues(issues, [inactive]);

		expect(result.totals).toEqual([]);
		expect(result.unassigned.committedMinutes).toBe(240);
		expect(result.unassigned.issueIndexes).toEqual([0]);
		expect(result.unassigned.over).toBe(false);
	});

	test("an unmatched assignee is unassigned", () => {
		const issues: CapacityIssue[] = [
			{ estimateMinutes: 120, assignees: [key("ghost")] },
		];
		const result = distributeIssues(issues, [ann]);

		expect(result.totals[0]?.committedMinutes).toBe(0);
		expect(result.unassigned.committedMinutes).toBe(120);
	});

	test("every active maintainer gets a lane even with no issues", () => {
		const bob = person("bob");
		const result = distributeIssues([], [ann, bob]);

		expect(result.totals).toEqual([
			{
				key: maintainerKey(ann),
				capMinutes: 360,
				committedMinutes: 0,
				remainingMinutes: 360,
				over: false,
				issueIndexes: [],
			},
			{
				key: maintainerKey(bob),
				capMinutes: 360,
				committedMinutes: 0,
				remainingMinutes: 360,
				over: false,
				issueIndexes: [],
			},
		]);
	});

	test("keeps null estimates out of committed minutes", () => {
		const issues: CapacityIssue[] = [
			{ estimateMinutes: null, assignees: [key("ann")] },
			{ estimateMinutes: 240, assignees: [key("ann")] },
		];
		const result = distributeIssues(issues, [ann]);

		expect(result.totals[0]?.committedMinutes).toBe(240);
		expect(result.unestimated).toEqual([0]);
	});

	test("deduplicates repeated assignees", () => {
		const issues: CapacityIssue[] = [
			{ estimateMinutes: 241, assignees: [key("ann"), key("ann")] },
		];
		const result = distributeIssues(issues, [ann]);

		expect(result.totals[0]?.committedMinutes).toBe(241);
	});
});

describe("overCapacity", () => {
	test("reports each over-cap active lane", () => {
		const issues: CapacityIssue[] = [
			{ estimateMinutes: 240, assignees: [key("ann")] },
			{ estimateMinutes: 240, assignees: [key("ann")] },
		];
		expect(overCapacity(issues, [ann], 60, 1)).toEqual([
			{ login: "ann", capMinutes: 360, committedMinutes: 480, excessMinutes: 120 },
		]);
	});

	test("a null window never reports over", () => {
		const issues: CapacityIssue[] = [
			{ estimateMinutes: 480, assignees: [key("ann")] },
		];
		expect(overCapacity(issues, [ann], 60, null)).toEqual([]);
	});

	test("unassigned work never reports over", () => {
		const issues: CapacityIssue[] = [
			{ estimateMinutes: 480, assignees: [key("ghost")] },
		];
		expect(overCapacity(issues, [ann], 60, 1)).toEqual([]);
	});

	test("a zero-capacity lane is over when it has work", () => {
		const idle = person("ann", { weeklyMinutes: 0 });
		const issues: CapacityIssue[] = [
			{ estimateMinutes: 120, assignees: [maintainerKey(idle)] },
		];
		expect(overCapacity(issues, [idle], 60, 1)).toEqual([
			{ login: "ann", capMinutes: 0, committedMinutes: 120, excessMinutes: 120 },
		]);
	});
});
