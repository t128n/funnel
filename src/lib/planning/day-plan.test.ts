import { describe, expect, test } from "bun:test";
import type { DayWindow, WorkHours } from "./availability";
import {
	DayBlockError,
	autoDayPlan,
	dayReview,
	validateDayBlocks,
} from "./day-plan";
import type { DayBlockInput, DayCandidate, DayReviewInput, DayBlockInputSet } from "./day-plan";

const DATE = "2026-10-26"; // Monday
const SUNDAY = "2026-10-25";

function hours(overrides: Partial<WorkHours> = {}): WorkHours {
	return {
		timezone: "UTC",
		startMinute: 540,
		endMinute: 1020,
		workDays: [1, 2, 3, 4, 5],
		bufferPercent: 20,
		...overrides,
	};
}

let nextRef = 1;

function issue(
	startMinute: number,
	minutes: number,
	issueNumber = nextRef++,
	org = "acme",
	name = "core",
): DayBlockInput {
	return { startMinute, minutes, kind: "issue", org, name, issueNumber };
}

function buffer(startMinute: number, minutes: number): DayBlockInput {
	return {
		startMinute,
		minutes,
		kind: "buffer",
		org: null,
		name: null,
		issueNumber: null,
	};
}

function candidate(
	priority: string | null,
	minutes: number,
	issueNumber: number,
): DayCandidate {
	return {
		org: "acme",
		name: "core",
		issueNumber,
		title: `Issue ${issueNumber}`,
		size: "md",
		priority,
		minutes,
	};
}

function set(blocks: DayBlockInput[], date = DATE): DayBlockInputSet {
	return { date, blocks, hours: hours(), windows: [] };
}

function issueMinutes(blocks: DayBlockInput[]): number {
	return blocks
		.filter((block) => block.kind === "issue")
		.reduce((total, block) => total + block.minutes, 0);
}

function bufferMinutes(blocks: DayBlockInput[]): number {
	return blocks
		.filter((block) => block.kind === "buffer")
		.reduce((total, block) => total + block.minutes, 0);
}

describe("validateDayBlocks", () => {
	test("test_overlap: rejects overlapping blocks with the HH:MM of the offender", () => {
		expect(() =>
			validateDayBlocks(set([issue(540, 60), issue(570, 30)])),
		).toThrow(new DayBlockError("Blocks overlap at 09:30"));
	});

	test("test_bounds_kinds: rejects short blocks, overruns, too many blocks and bad refs", () => {
		expect(() => validateDayBlocks(set([issue(540, 4)]))).toThrow(DayBlockError);
		expect(() => validateDayBlocks(set([issue(1430, 20)]))).toThrow(DayBlockError);

		const many: DayBlockInput[] = [];
		for (let i = 0; i < 41; i += 1) many.push(issue(i * 5, 5));
		expect(() => validateDayBlocks(set(many))).toThrow(DayBlockError);

		expect(() =>
			validateDayBlocks(
				set([{ ...issue(540, 60), org: null }]),
			),
		).toThrow(DayBlockError);
		expect(() =>
			validateDayBlocks(
				set([{ ...buffer(540, 60), org: "acme" }]),
			),
		).toThrow(DayBlockError);
		expect(() =>
			validateDayBlocks(
				set([{ ...buffer(540, 60), issueNumber: 12 }]),
			),
		).toThrow(DayBlockError);
	});

	test("test_sorted_copy: returns ascending copies and leaves the input untouched", () => {
		const later = issue(600, 60);
		const earlier = issue(540, 60);
		const input = [later, earlier];
		const snapshot = structuredClone(input);
		const blocks = set(input);

		const result = validateDayBlocks(blocks);

		expect(result.map((block) => block.startMinute)).toEqual([540, 600]);
		expect(input).toEqual(snapshot);
		expect(result[0]).not.toBe(earlier);
	});

	test("accepts adjacent blocks and a valid buffer", () => {
		expect(
			validateDayBlocks(set([issue(540, 60), issue(600, 60), buffer(660, 30)])),
		).toHaveLength(3);
	});
});

describe("autoDayPlan", () => {
	test("test_auto_buffer: reserves the buffer and omits a candidate that cannot fit", () => {
		const blocks = autoDayPlan({
			date: DATE,
			hours: hours(),
			windows: [],
			candidates: [candidate("P1", 300, 2), candidate("P1", 240, 3)],
		});

		expect(issueMinutes(blocks)).toBe(300);
		expect(bufferMinutes(blocks)).toBe(180);
		expect(blocks.filter((block) => block.kind === "issue")).toHaveLength(1);
		expect(blocks.filter((block) => block.kind === "buffer")).toEqual([
			buffer(840, 180),
		]);
	});

	test("test_auto_split: splits an issue across available ranges", () => {
		const windows: DayWindow[] = [
			{ label: "Lunch", weekday: null, date: DATE, startMinute: 660, endMinute: 720 },
		];

		const blocks = autoDayPlan({
			date: DATE,
			hours: hours(),
			windows,
			candidates: [candidate("P1", 300, 1)],
		});

		expect(blocks.filter((block) => block.kind === "issue")).toEqual([
			issue(540, 120, 1),
			issue(720, 180, 1),
		]);
	});

	test("test_auto_priority: fills P1, P2, then unprioritized, each once", () => {
		const blocks = autoDayPlan({
			date: DATE,
			hours: hours({ bufferPercent: 0 }),
			windows: [],
			candidates: [
				candidate(null, 30, 3),
				candidate("P2", 30, 2),
				candidate("P1", 30, 1),
			],
		});

		expect(blocks.filter((block) => block.kind === "issue")).toEqual([
			issue(540, 30, 1),
			issue(570, 30, 2),
			issue(600, 30, 3),
		]);
	});

	test("test_auto_priority: a non-work day yields no blocks", () => {
		expect(
			autoDayPlan({
				date: SUNDAY,
				hours: hours(),
				windows: [],
				candidates: [candidate("P1", 60, 1)],
			}),
		).toEqual([]);
	});

	test("never emits an issue fragment shorter than 15 minutes", () => {
		const windows: DayWindow[] = [
			{ label: "Standup", weekday: null, date: DATE, startMinute: 660, endMinute: 720 },
		];

		const blocks = autoDayPlan({
			date: DATE,
			hours: hours({ bufferPercent: 0 }),
			windows,
			candidates: [candidate("P1", 150, 1)],
		});

		for (const block of blocks) {
			expect(block.minutes).toBeGreaterThanOrEqual(15);
		}
	});

	test("turns leftover space into a buffer block", () => {
		const blocks = autoDayPlan({
			date: DATE,
			hours: hours({ bufferPercent: 0 }),
			windows: [],
			candidates: [],
		});

		expect(blocks).toEqual([buffer(540, 480)]);
	});
});

describe("dayReview", () => {
	test("test_review: variance is actual minus planned and buffers are excluded", () => {
		const blocks = [issue(540, 240, 1), buffer(780, 60), issue(840, 60, 2)];
		const input: DayReviewInput = {
			blocks,
			actualByKey: new Map([
				["acme/core#1", 300],
				["acme/core#2", 30],
			]),
		};

		const review = dayReview(input);

		expect(review.rows).toEqual([
			{
				key: "acme/core#1",
				plannedMinutes: 240,
				actualMinutes: 300,
				varianceMinutes: 60,
			},
			{
				key: "acme/core#2",
				plannedMinutes: 60,
				actualMinutes: 30,
				varianceMinutes: -30,
			},
		]);
		expect(review.plannedMinutes).toBe(300);
		expect(review.actualMinutes).toBe(330);
		expect(review.varianceMinutes).toBe(30);
	});

	test("aggregates repeated blocks for one issue", () => {
		const blocks = [issue(540, 60, 7), buffer(600, 15), issue(615, 30, 7)];

		const review = dayReview({
			blocks,
			actualByKey: new Map([["acme/core#7", 120]]),
		});

		expect(review.rows).toEqual([
			{
				key: "acme/core#7",
				plannedMinutes: 90,
				actualMinutes: 120,
				varianceMinutes: 30,
			},
		]);
	});

	test("returns zeroes for an empty day", () => {
		expect(dayReview({ blocks: [], actualByKey: new Map() })).toEqual({
			rows: [],
			plannedMinutes: 0,
			actualMinutes: 0,
			varianceMinutes: 0,
		});
	});
});
