/**
 * Presentation helpers for the planner.
 *
 * Pure and dependency-free so the Svelte components and bun tests share one
 * definition of the capacity thresholds.
 */

/** How a lane's committed load compares with its cap. */
export type CapacityTone = "empty" | "near" | "over";

/**
 * Traffic-light tone for a capacity bar.
 *
 * A zero cap is empty until work exists, then over. Work above the cap is over;
 * from 80% of the cap upward is near. The 80% line leaves room for the 60%
 * allocation marker without every ordinary week reading as a warning.
 */
export function capacityTone(
	committedMinutes: number,
	capMinutes: number,
): CapacityTone {
	if (!Number.isFinite(committedMinutes) || committedMinutes <= 0) {
		return "empty";
	}
	if (capMinutes <= 0) return "over";
	if (committedMinutes > capMinutes) return "over";
	if (committedMinutes / capMinutes >= 0.8) return "near";
	return "empty";
}

/** Format a milestone due date (`YYYY-MM-DD` in UTC), or its absence. */
export function dueLabel(dueOn: number | null | undefined): string {
	if (dueOn === null || dueOn === undefined || !Number.isFinite(dueOn)) {
		return "No due date";
	}
	return new Date(dueOn).toISOString().slice(0, 10);
}

/** Describe the milestone capacity window without implying a cap when absent. */
export function weeksLabel(capacityWeeks: number | null | undefined): string {
	if (capacityWeeks === null || capacityWeeks === undefined) {
		return "No due date";
	}
	return `${capacityWeeks} ${capacityWeeks === 1 ? "week" : "weeks"}`;
}
