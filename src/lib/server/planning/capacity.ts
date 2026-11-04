/**
 * The capacity model (SPEC §3).
 *
 * Estimates are fixed size-to-minutes mappings owned by settings; an issue's
 * estimate is split evenly across the active maintainers among its assignees
 * with the integer remainder going to the first one. Work assigned only to
 * inactive or unconfigured people lands in an unassigned bucket with no cap.
 * Unestimated issues never contribute committed minutes, but they are still
 * attributed to the lane that owns them so the planner can show the commitment.
 *
 * All arithmetic is integer minutes. Capacity for a window is
 * `floor(weeklyMinutes * weeks * allocationPercent / 100)`.
 */

/** A mirrored forge person with net weekly availability. */
export interface CapacityMaintainer {
	forge: string;
	instance: string;
	externalId: string;
	login: string;
	avatarUrl: string | null;
	weeklyMinutes: number;
	/** Inactive maintainers keep no lane and receive no committed minutes. */
	active: boolean;
}

/** One planned issue as capacity sees it; `assignees` are maintainer keys. */
export interface CapacityIssue {
	/** `null` when the issue has no size label. */
	estimateMinutes: number | null;
	/** {@link maintainerKey} values from the mirror's assignees. */
	assignees: string[];
}

/** One maintainer lane, or the unassigned bucket. */
export interface CapacityTotal {
	/** {@link maintainerKey}, or `unassigned`. */
	key: string;
	capMinutes: number;
	committedMinutes: number;
	remainingMinutes: number;
	over: boolean;
	/** Indexes into the issue list this lane draws from, ascending. */
	issueIndexes: number[];
	/**
	 * Indexes of issues attributed to this lane without an estimate. They are
	 * visible commitments but contribute no minutes, so they are kept apart
	 * from {@link issueIndexes} and never affect the cap.
	 */
	unsizedIssueIndexes: number[];
}

/** A maintainer whose projected committed minutes exceed their cap. */
export interface CapacityViolation {
	login: string;
	capMinutes: number;
	committedMinutes: number;
	excessMinutes: number;
}

/** Lanes plus the buckets that have no cap. */
export interface CapacityDistribution {
	/** One lane per active maintainer, in maintainer order. */
	totals: CapacityTotal[];
	/** Work with no active, configured assignee; never over. */
	unassigned: CapacityTotal;
	/** Indexes of issues with a `null` estimate. */
	unestimated: number[];
}

/** Stable identity for a maintainer: forge, instance and external id. */
export function maintainerKey(maintainer: CapacityMaintainer): string {
	return `${maintainer.forge}:${maintainer.instance}:${maintainer.externalId}`;
}

/** Resolve a size label through the configured size map. */
export function estimateMinutes(
	size: string | null | undefined,
	sizeMinutes: Record<string, number>,
): number | null {
	if (size === null || size === undefined) return null;
	const minutes = sizeMinutes[size];
	return typeof minutes === "number" && Number.isFinite(minutes)
		? Math.trunc(minutes)
		: null;
}

/**
 * Capacity for a window. A `null` window (a milestone without a due date) has
 * no cap; zero or negative windows are zero. The percentage floors.
 */
export function capMinutes(
	weeklyMinutes: number,
	allocationPercent: number,
	weeks: number | null,
): number {
	if (weeks === null || weeks <= 0) return 0;
	return Math.floor((weeklyMinutes * weeks * allocationPercent) / 100);
}

/**
 * Split `total` into `parts` integer shares. The remainder goes to the first
 * share so the sum is exact.
 */
export function splitMinutes(total: number, parts: number): number[] {
	if (parts <= 0) return [];
	const base = Math.floor(total / parts);
	const remainder = total - base * parts;
	return Array.from({ length: parts }, (_, index) =>
		index === 0 ? base + remainder : base,
	);
}

/** Deduplicate keys while preserving their first-seen order. */
function unique(keys: readonly string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const key of keys) {
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(key);
	}
	return out;
}

/**
 * Build every active maintainer's lane for one window and bucket the rest.
 *
 * `allocationPercent` defaults to the instance default of 60 and `weeks` to a
 * single week. Pass `null` for a milestone without a due date: lanes still
 * show committed minutes but are never over.
 */
export function distributeIssues(
	issues: readonly CapacityIssue[],
	maintainers: readonly CapacityMaintainer[],
	allocationPercent = 60,
	weeks: number | null = 1,
): CapacityDistribution {
	const active = maintainers.filter((maintainer) => maintainer.active);
	const known = new Set(active.map(maintainerKey));
	const totals: CapacityTotal[] = active.map((maintainer) => ({
		key: maintainerKey(maintainer),
		capMinutes: capMinutes(
			maintainer.weeklyMinutes,
			allocationPercent,
			weeks,
		),
		committedMinutes: 0,
		remainingMinutes: 0,
		over: false,
		issueIndexes: [],
		unsizedIssueIndexes: [],
	}));
	const lanes = new Map(totals.map((lane) => [lane.key, lane]));
	const unassigned: CapacityTotal = {
		key: "unassigned",
		capMinutes: 0,
		committedMinutes: 0,
		remainingMinutes: 0,
		over: false,
		issueIndexes: [],
		unsizedIssueIndexes: [],
	};
	const unestimated: number[] = [];

	issues.forEach((issue, index) => {
		if (issue.estimateMinutes === null) {
			unestimated.push(index);
			// An unestimated issue is still a commitment. Attribute it to the
			// same lanes as sized work so the plan can show it where it belongs,
			// but never add minutes to that lane.
			const assignees = unique(issue.assignees).filter((key) => known.has(key));
			if (assignees.length === 0) {
				unassigned.unsizedIssueIndexes.push(index);
				return;
			}
			for (const key of assignees) {
				lanes.get(key)?.unsizedIssueIndexes.push(index);
			}
			return;
		}
		const estimate = Math.max(0, Math.trunc(issue.estimateMinutes));
		const assignees = unique(issue.assignees).filter((key) => known.has(key));
		if (assignees.length === 0) {
			unassigned.committedMinutes += estimate;
			unassigned.issueIndexes.push(index);
			return;
		}
		const shares = splitMinutes(estimate, assignees.length);
		assignees.forEach((key, shareIndex) => {
			const lane = lanes.get(key);
			if (!lane) return;
			lane.committedMinutes += shares[shareIndex] ?? 0;
			lane.issueIndexes.push(index);
		});
	});

	for (const lane of totals) {
		// A window without a due date has no cap, so it can never be over.
		lane.over = weeks !== null && lane.committedMinutes > lane.capMinutes;
		lane.remainingMinutes =
			weeks === null ? 0 : lane.capMinutes - lane.committedMinutes;
	}

	return { totals, unassigned, unestimated };
}

/**
 * Every active lane over its cap after the issues are applied, in maintainer
 * order. Unassigned work and unestimated issues never produce a violation, and
 * a `null` window is unconstrained.
 */
export function overCapacity(
	issues: readonly CapacityIssue[],
	maintainers: readonly CapacityMaintainer[],
	allocationPercent = 60,
	weeks: number | null = 1,
): CapacityViolation[] {
	if (weeks === null) return [];
	const byKey = new Map(
		maintainers
			.filter((maintainer) => maintainer.active)
			.map((maintainer) => [maintainerKey(maintainer), maintainer]),
	);
	return distributeIssues(issues, maintainers, allocationPercent, weeks)
		.totals.filter((lane) => lane.over)
		.map((lane) => {
			const maintainer = byKey.get(lane.key);
			return {
				login: maintainer?.login ?? lane.key,
				capMinutes: lane.capMinutes,
				committedMinutes: lane.committedMinutes,
				excessMinutes: lane.committedMinutes - lane.capMinutes,
			};
		});
}
