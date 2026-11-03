/**
 * Pure week-picker and eligibility helpers for the issue-level plan control.
 *
 * A commitment is one Monday week. The picker offers a small forward window
 * plus any week the issue is already in, so an old plan can always be changed
 * or cleared. Eligibility mirrors the server's schedule mutation: open, sized,
 * and assigned to at least one active maintainer.
 */
import type { IssueListItem } from "#lib/server/issues/types";
import { weekHeadline } from "./format";

const DAY_MS = 86_400_000;

/** One selectable week. `value` is the Monday `YYYY-MM-DD`. */
export interface PlanWeekOption {
	value: string;
	label: string;
}

/** Why an issue cannot be committed to a week right now. */
export type PlanBlockReason = "closed" | "unestimated" | "unowned" | null;

/** The helper copy shown under the picker when a schedule would be rejected. */
export function planBlockMessage(reason: PlanBlockReason): string | null {
	switch (reason) {
		case "closed":
			return "Closed issues cannot be planned.";
		case "unestimated":
			return "Add a size before planning this issue.";
		case "unowned":
			return "Assign an active maintainer before planning this issue.";
		default:
			return null;
	}
}

/**
 * Whether the issue can be committed to a week, using the same three rules as
 * `scheduleIssue`: open, sized, and owned by an active maintainer.
 */
export function planEligibility(
	issue: Pick<IssueListItem, "state" | "size" | "assignees">,
	activeMaintainers: readonly string[],
): { schedulable: boolean; reason: PlanBlockReason } {
	if (issue.state !== "open") {
		return { schedulable: false, reason: "closed" };
	}
	if (issue.size === null) {
		return { schedulable: false, reason: "unestimated" };
	}
	const active = new Set(activeMaintainers);
	if (
		!issue.assignees.some((assignee) =>
			active.has(`${assignee.forge}:${assignee.instance}:${assignee.externalId}`)
		)
	) {
		return { schedulable: false, reason: "unowned" };
	}
	return { schedulable: true, reason: null };
}

/** Monday of the UTC week containing `now`, as `YYYY-MM-DD`. */
export function mondayOf(now: Date = new Date()): string {
	const midnight = Date.UTC(
		now.getUTCFullYear(),
		now.getUTCMonth(),
		now.getUTCDate(),
	);
	const weekday = new Date(midnight).getUTCDay();
	const monday = midnight - ((weekday + 6) % 7) * DAY_MS;
	return new Date(monday).toISOString().slice(0, 10);
}

/** Shift a Monday week by whole weeks. */
export function shiftWeek(week: string, weeks: number): string {
	const start = Date.parse(`${week}T00:00:00Z`);
	return new Date(start + Math.trunc(weeks) * 7 * DAY_MS)
		.toISOString()
		.slice(0, 10);
}

/** `2026-11-02` → `2 Nov`. */
function shortDate(week: string): string {
	const [, month, day] = week.split("-").map(Number) as [number, number, number];
	const months = [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec",
	];
	return `${day} ${months[month - 1]}`;
}

function relativeLabel(week: string, offset: number): string {
	if (offset === 0) return `This week · ${shortDate(week)}`;
	if (offset === 1) return `Next week · ${shortDate(week)}`;
	if (offset === 2) return `In 2 weeks · ${shortDate(week)}`;
	return weekHeadline(week);
}

/**
 * The weeks offered by the picker: two weeks back and twelve forward from
 * `now`, plus the issue's current week when it falls outside that window.
 */
export function planWeekOptions(
	current: string | null,
	now: Date = new Date(),
): PlanWeekOption[] {
	const thisWeek = mondayOf(now);
	const options: PlanWeekOption[] = [];
	for (let offset = -2; offset <= 12; offset += 1) {
		const value = shiftWeek(thisWeek, offset);
		options.push({ value, label: relativeLabel(value, offset) });
	}
	if (current !== null && !options.some((option) => option.value === current)) {
		options.unshift({ value: current, label: weekHeadline(current) });
	}
	return options;
}
