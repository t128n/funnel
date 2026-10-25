/**
 * ALPEN day model: validated manual blocks, automatic planning and review.
 *
 * The model is pure. It works in local minutes from midnight and takes the
 * viewer's effective hours plus the unavailable windows that apply to the
 * day. Manual blocks may overrun the work window (the UI flags that); only
 * {@link autoDayPlan} enforces hours and the reserved buffer.
 */
import { formatClock } from "../time/zoned";
import {
	availableRanges,
	bufferMinutes as reservedBuffer,
	issueRefKey,
} from "./availability";
import type { DayWindow, MinuteRange, WorkHours } from "./availability";

/** `issue` blocks carry a ref; `buffer` blocks reserve time and carry none. */
export type DayBlockKind = "issue" | "buffer";

/** A caller-supplied day block, before it is assigned an id and a date. */
export interface DayBlockInput {
	startMinute: number;
	minutes: number;
	kind: DayBlockKind;
	/** Set only for `issue` blocks. */
	org: string | null;
	/** Set only for `issue` blocks. */
	name: string | null;
	/** Set only for `issue` blocks. */
	issueNumber: number | null;
}

/** A persisted day block. */
export interface DayBlock extends DayBlockInput {
	id: string;
	/** The viewer's local day, `YYYY-MM-DD`. */
	date: string;
}

/** One issue offered to an ALPEN day. */
export interface DayCandidate {
	org: string;
	name: string;
	issueNumber: number;
	title: string;
	/** `sm` | `md` | `lg`. */
	size: string;
	/** Derived `P1`–`P3`, or `null` when unprioritized. */
	priority: string | null;
	/** Planned length in minutes; seeds the day block. */
	minutes: number;
}

/** One issue's planned-vs-actual row. */
export interface DayReviewRow {
	/** `issueRefKey(org, name, issueNumber)`. */
	key: string;
	plannedMinutes: number;
	actualMinutes: number;
	varianceMinutes: number;
}

/** Planned-vs-actual review for a day. Buffer blocks are excluded. */
export interface DayReview {
	rows: DayReviewRow[];
	plannedMinutes: number;
	actualMinutes: number;
	varianceMinutes: number;
}

/** Input for {@link validateDayBlocks}. */
export interface DayBlockInputSet {
	date: string;
	blocks: readonly DayBlockInput[];
	/** Ignored by validation; accepted so a route can pass its whole payload. */
	hours?: WorkHours;
	/** Ignored by validation; accepted so a route can pass its whole payload. */
	windows?: readonly DayWindow[];
}

/** Input for {@link autoDayPlan}. */
export interface AutoDayInput {
	date: string;
	hours: WorkHours;
	windows: readonly DayWindow[];
	/** Candidates in any order; the model sorts them by priority then number. */
	candidates: readonly DayCandidate[];
}

/** Input for {@link dayReview}. */
export interface DayReviewInput {
	blocks: readonly DayBlockInput[];
	/** Actual minutes per `issueRefKey(org, name, issueNumber)`. */
	actualByKey: ReadonlyMap<string, number>;
}

/** Raised when day blocks fail validation. */
export class DayBlockError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "DayBlockError";
	}
}

const MAX_BLOCKS = 40;
const MIN_BLOCK_MINUTES = 5;
/** No split fragment may be shorter than this. */
const MIN_FRAGMENT_MINUTES = 15;

function hasRef(block: DayBlockInput): boolean {
	return block.org !== null && block.name !== null && block.issueNumber !== null;
}

function checkBlock(block: DayBlockInput): void {
	if (block.kind !== "issue" && block.kind !== "buffer") {
		throw new DayBlockError(`Unknown block kind: ${String(block.kind)}`);
	}
	if (!Number.isInteger(block.startMinute) || block.startMinute < 0) {
		throw new DayBlockError(`Invalid block start: ${String(block.startMinute)}`);
	}
	if (!Number.isInteger(block.minutes) || block.minutes < MIN_BLOCK_MINUTES) {
		throw new DayBlockError(
			`Block at ${formatClock(block.startMinute)} must be at least ${MIN_BLOCK_MINUTES} minutes`,
		);
	}
	if (block.startMinute + block.minutes > 1440) {
		throw new DayBlockError(
			`Block at ${formatClock(block.startMinute)} exceeds the end of the day`,
		);
	}

	if (block.kind === "issue") {
		if (
			typeof block.org !== "string" ||
			block.org.trim() === "" ||
			typeof block.name !== "string" ||
			block.name.trim() === "" ||
			!Number.isInteger(block.issueNumber) ||
			(block.issueNumber ?? 0) <= 0
		) {
			throw new DayBlockError(
				`Issue block at ${formatClock(block.startMinute)} needs an issue reference`,
			);
		}
	} else if (block.org !== null || block.name !== null || block.issueNumber !== null) {
		throw new DayBlockError(
			`Buffer block at ${formatClock(block.startMinute)} cannot carry an issue reference`,
		);
	}
}

/**
 * Validate and normalize caller-supplied blocks: sorted by start, with every
 * reference copied onto a fresh object. The input is never mutated.
 */
export function validateDayBlocks(input: DayBlockInputSet): DayBlockInput[] {
	const blocks = input.blocks ?? [];
	if (blocks.length > MAX_BLOCKS) {
		throw new DayBlockError(`A day has at most ${MAX_BLOCKS} blocks`);
	}

	const normalized = blocks.map((block) => ({
		startMinute: block.startMinute,
		minutes: block.minutes,
		kind: block.kind,
		org: block.org ?? null,
		name: block.name ?? null,
		issueNumber: block.issueNumber ?? null,
	}));
	for (const block of normalized) checkBlock(block);

	normalized.sort((a, b) => a.startMinute - b.startMinute);
	for (let i = 1; i < normalized.length; i += 1) {
		const previous = normalized[i - 1] as DayBlockInput;
		const block = normalized[i] as DayBlockInput;
		if (block.startMinute < previous.startMinute + previous.minutes) {
			throw new DayBlockError(`Blocks overlap at ${formatClock(block.startMinute)}`);
		}
	}
	return normalized;
}

function priorityRank(candidate: DayCandidate): number {
	switch (candidate.priority?.toUpperCase()) {
		case "P1":
			return 0;
		case "P2":
			return 1;
		case "P3":
			return 2;
		default:
			return 3;
	}
}

function compareCandidates(a: DayCandidate, b: DayCandidate): number {
	return (
		priorityRank(a) - priorityRank(b) ||
		a.issueNumber - b.issueNumber ||
		a.org.localeCompare(b.org) ||
		a.name.localeCompare(b.name)
	);
}

interface Fragment {
	start: number;
	minutes: number;
	range: number;
}

interface Placement {
	fragments: Fragment[];
	endRange: number;
	endMinute: number;
}

/**
 * Place one candidate from `(startRange, startMinute)` onwards. Each emitted
 * fragment is at least 15 minutes; a candidate that cannot be placed without
 * a shorter fragment is rejected as a whole.
 */
function placeCandidate(
	ranges: readonly MinuteRange[],
	startRange: number,
	startMinute: number,
	minutes: number,
): Placement | null {
	if (minutes <= 0) return null;

	const fragments: Fragment[] = [];
	let left = minutes;
	let index = startRange;
	let at = startMinute;

	while (left > 0 && index < ranges.length) {
		const range = ranges[index] as MinuteRange;
		if (at < range.start) at = range.start;

		const space = range.end - at;
		if (space <= 0) {
			index += 1;
			at = ranges[index]?.start ?? 0;
			continue;
		}

		let take = Math.min(left, space);
		const rest = left - take;
		if (rest > 0 && (take < MIN_FRAGMENT_MINUTES || rest < MIN_FRAGMENT_MINUTES)) {
			// A split must not leave either side under 15 minutes. Give back
			// enough room for the next fragment to reach 15, else skip this
			// range and look for a larger one.
			take = rest < MIN_FRAGMENT_MINUTES ? take - (MIN_FRAGMENT_MINUTES - rest) : take;
			if (take < MIN_FRAGMENT_MINUTES) {
				index += 1;
				at = ranges[index]?.start ?? 0;
				continue;
			}
		}

		fragments.push({ start: at, minutes: take, range: index });
		left -= take;
		at += take;
		if (at >= range.end) {
			index += 1;
			at = ranges[index]?.start ?? 0;
		}
	}

	if (left > 0 || fragments.length === 0) return null;

	const last = fragments[fragments.length - 1] as Fragment;
	return { fragments, endRange: last.range, endMinute: last.start + last.minutes };
}

function issueBlock(
	fragment: Fragment,
	candidate: DayCandidate,
	org: string,
	name: string,
): DayBlockInput {
	return {
		startMinute: fragment.start,
		minutes: fragment.minutes,
		kind: "issue",
		org,
		name,
		issueNumber: candidate.issueNumber,
	};
}

function bufferBlock(startMinute: number, minutes: number): DayBlockInput {
	return {
		startMinute,
		minutes,
		kind: "buffer",
		org: null,
		name: null,
		issueNumber: null,
	};
}

/**
 * Build a day: fill the available ranges in candidate order, spending at most
 * `availableMinutes - bufferMinutes`. Every candidate is placed at most once
 * and a candidate that cannot fit without leaving a fragment under 15 minutes
 * is omitted. Leftover space of 15 minutes or more per range becomes explicit
 * buffer blocks; smaller leftovers extend the previous block.
 */
export function autoDayPlan(input: AutoDayInput): DayBlockInput[] {
	const ranges = availableRanges(input.hours, input.date, input.windows);
	if (ranges.length === 0) return [];

	const available = ranges.reduce(
		(total, range) => total + (range.end - range.start),
		0,
	);
	const capacity = Math.max(0, available - reservedBuffer(input.hours, available));

	const candidates = [...input.candidates].sort(compareCandidates);
	const blocks: DayBlockInput[] = [];
	let cursorRange = 0;
	let cursorMinute = (ranges[0] as MinuteRange).start;
	let remainingCapacity = capacity;

	for (const candidate of candidates) {
		if (candidate.minutes <= 0 || candidate.minutes > remainingCapacity) continue;

		const placement = placeCandidate(
			ranges,
			cursorRange,
			cursorMinute,
			candidate.minutes,
		);
		if (!placement) continue;

		for (const fragment of placement.fragments) {
			blocks.push(issueBlock(fragment, candidate, candidate.org, candidate.name));
		}
		cursorRange = placement.endRange;
		cursorMinute = placement.endMinute;
		remainingCapacity -= candidate.minutes;
	}

	// Everything after the last placed block is buffer. A range tail under
	// 15 minutes extends the block before it instead of becoming a stub.
	let rangeIndex = cursorRange;
	let at = cursorMinute;
	while (rangeIndex < ranges.length) {
		const range = ranges[rangeIndex] as MinuteRange;
		const start = Math.max(at, range.start);
		const leftover = range.end - start;

		if (leftover >= MIN_FRAGMENT_MINUTES) {
			blocks.push(bufferBlock(start, leftover));
		} else if (leftover > 0) {
			const previous = blocks[blocks.length - 1];
			if (previous && previous.startMinute + previous.minutes === start) {
				previous.minutes += leftover;
			}
		}

		rangeIndex += 1;
		at = ranges[rangeIndex]?.start ?? 0;
	}

	blocks.sort((a, b) => a.startMinute - b.startMinute);
	return blocks;
}

/**
 * Compare every planned issue's blocks with the caller's clipped actuals.
 * Rows follow the first appearance of each issue in the (start-sorted) day;
 * buffer blocks are excluded from both the rows and the totals.
 */
export function dayReview(input: DayReviewInput): DayReview {
	const order: string[] = [];
	const planned = new Map<string, number>();

	for (const block of input.blocks) {
		if (block.kind !== "issue" || !hasRef(block)) continue;
		const key = issueRefKey(
			block.org as string,
			block.name as string,
			block.issueNumber as number,
		);
		if (!planned.has(key)) order.push(key);
		planned.set(key, (planned.get(key) ?? 0) + block.minutes);
	}

	const rows = order.map((key) => {
		const plannedMinutes = planned.get(key) ?? 0;
		const actualMinutes = input.actualByKey.get(key) ?? 0;
		return {
			key,
			plannedMinutes,
			actualMinutes,
			varianceMinutes: actualMinutes - plannedMinutes,
		};
	});

	const plannedMinutes = rows.reduce((total, row) => total + row.plannedMinutes, 0);
	const actualMinutes = rows.reduce((total, row) => total + row.actualMinutes, 0);

	return {
		rows,
		plannedMinutes,
		actualMinutes,
		varianceMinutes: actualMinutes - plannedMinutes,
	};
}
