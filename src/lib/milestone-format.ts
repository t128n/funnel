/**
 * Milestone list/detail formatting.
 *
 * A milestone is overdue only while it still has open work and has not been
 * closed; the date rule itself matches the Timeline's `isOverdue`, so the same
 * milestone reports the same risk on both surfaces.
 */
import { isOverdue } from "#lib/components/timeline/timeline-format";

export interface MilestoneProgress {
	state: string;
	dueOn: number | null;
	openIssues: number;
	closedIssues: number;
}

/** `closed / (open + closed)`, or `0` for a milestone with no issues. */
export function milestoneProgress(milestone: MilestoneProgress): number {
	const total = milestone.closedIssues + milestone.openIssues;
	return total === 0 ? 0 : milestone.closedIssues / total;
}

/** True for a past-due, unfinished, still-open milestone. */
export function isMilestoneOverdue(
	milestone: MilestoneProgress,
	now: number,
): boolean {
	if (milestone.state === "closed") return false;
	return isOverdue(
		{ dueOn: milestone.dueOn, progress: milestoneProgress(milestone) },
		now,
	);
}

/** `YYYY-MM-DD`, or `null` when the milestone has no due date. */
export function milestoneDueLabel(dueOn: number | null): string | null {
	return dueOn === null ? null : new Date(dueOn).toISOString().slice(0, 10);
}
