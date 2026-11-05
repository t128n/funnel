/**
 * Milestone list/detail formatting.
 *
 * A milestone is overdue only while it still has open work and has not been
 * closed; the date rule itself matches the Timeline's `isOverdue`, so the same
 * milestone reports the same risk on both surfaces.
 */
import { isOverdue, utcDay } from "#lib/components/timeline/timeline-format";
import type { RepoMilestoneRef } from "#lib/server/issues/types";
import { absoluteDate } from "#lib/time";

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

/** The issue Properties row for a milestone. */
export interface MilestonePropertyLabel {
	/** Milestone title, or `null` when the issue has no milestone. */
	title: string | null;
	/** Segment after the title (`due 8 Nov 2026`, `closed`), or `null`. */
	detail: string | null;
	/** `title` attribute for the detail, carrying the absolute date. */
	detailTitle: string | null;
	/** `danger` for an open past-due milestone, otherwise `muted`. */
	tone: "danger" | "muted";
}

/**
 * Format the milestone attached to an issue for the read-only Properties row.
 *
 * The issue's milestone ref carries the state and due date but not its issue
 * counts, so overdue means "still open and past due" here. The UTC calendar-day
 * comparison matches `isOverdue`, keeping due today from reading as overdue.
 */
export function milestonePropertyLabel(
	milestone: RepoMilestoneRef | null,
	now: number,
): MilestonePropertyLabel {
	if (milestone === null) {
		return { title: null, detail: null, detailTitle: null, tone: "muted" };
	}

	if (milestone.state === "closed") {
		return {
			title: milestone.title,
			detail: "closed",
			detailTitle: null,
			tone: "muted",
		};
	}

	const dueLabel = milestoneDueLabel(milestone.dueOn);
	if (dueLabel === null) {
		return {
			title: milestone.title,
			detail: null,
			detailTitle: null,
			tone: "muted",
		};
	}

	const date = absoluteDate(dueLabel);
	return {
		title: milestone.title,
		detail: `due ${date}`,
		detailTitle: date,
		tone:
			milestone.dueOn !== null && utcDay(milestone.dueOn) < utcDay(now)
				? "danger"
				: "muted",
	};
}
