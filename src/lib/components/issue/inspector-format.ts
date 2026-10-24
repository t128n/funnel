/**
 * Pure formatting and visibility helpers for the Inspector's time, delay and
 * epic surfaces (SPEC §2, §3, §5). Kept out of the Svelte components so the
 * read-only rules and labels stay testable without a browser.
 */
import { DELAY_REASONS, type DelayReason } from "#lib/funnel-metadata";
import { formatMinutes } from "#lib/planning";
import type { DelayItem } from "#lib/server/actuals/store";
import type { IssueTime } from "#lib/server/actuals/time";
import type { EpicRef } from "#lib/server/issues/types";

/** Compact duration for the time card and delay rows (`4h`, `1h 30m`, `0m`). */
export function formatDuration(minutes: number | null | undefined): string {
	return formatMinutes(minutes);
}

export type TimeTone = "neutral" | "positive" | "negative";

export interface TimeCardRow {
	key: "estimate" | "actual" | "delay" | "variance";
	label: string;
	value: string;
	tone: TimeTone;
}

/** Tone a variance by its sign: over estimate is positive, under is negative. */
export function varianceTone(variance: number | null | undefined): TimeTone {
	if (variance === null || variance === undefined || variance === 0) {
		return "neutral";
	}
	return variance > 0 ? "positive" : "negative";
}

/** The four rows the time card renders, already formatted. */
export function timeCardRows(time: IssueTime): TimeCardRow[] {
	const variance = time.varianceMinutes;
	const varianceValue =
		variance === null || variance === undefined
			? "—"
			: variance === 0
				? formatDuration(0)
				: `${variance > 0 ? "+" : "-"}${formatDuration(Math.abs(variance))}`;
	return [
		{ key: "estimate", label: "Estimate", value: formatDuration(time.estimateMinutes), tone: "neutral" },
		{ key: "actual", label: "Actual", value: formatDuration(time.actualMinutes), tone: "neutral" },
		{ key: "delay", label: "Delay", value: formatDuration(time.delayMinutes), tone: "neutral" },
		{
			key: "variance",
			label: "Variance",
			value: varianceValue,
			tone: varianceTone(variance)
		}
	];
}

/** Automatic (blocked) rows are read-only; manual rows are local edits. */
export function splitDelays<T extends Pick<DelayItem, "source">>(
	delays: readonly T[]
): { automatic: T[]; manual: T[] } {
	return {
		automatic: delays.filter((delay) => delay.source === "blocked"),
		manual: delays.filter((delay) => delay.source === "manual")
	};
}

/** Only writers may close an open manual delay. */
export function canCloseDelay(
	delay: Pick<DelayItem, "source" | "endedAt">,
	mayWrite: boolean
): boolean {
	return mayWrite && delay.source === "manual" && delay.endedAt === null;
}

/** Only writers may delete a manual delay. */
export function canDeleteDelay(
	delay: Pick<DelayItem, "source">,
	mayWrite: boolean
): boolean {
	return mayWrite && delay.source === "manual";
}

const REASON_LABELS: Record<DelayReason, string> = {
	dependency: "Dependency",
	info: "Info",
	review: "Review",
	external: "External",
	capacity: "Capacity",
	other: "Other"
};

/** Human label for a canonical delay reason. */
export function delayReasonLabel(reason: string): string {
	return REASON_LABELS[reason as DelayReason] ?? reason;
}

/** Elapsed minutes for a delay row; open intervals run to `now`. */
export function delayDuration(
	delay: Pick<DelayItem, "startedAt" | "endedAt">,
	now: number = Date.now()
): string {
	const end = delay.endedAt ?? now;
	return formatDuration(Math.max(0, Math.round((end - delay.startedAt) / 60_000)));
}

/** Whether the block dialog has the structured reason it must submit. */
export function isDelayReason(value: unknown): value is DelayReason {
	return (
		typeof value === "string" &&
		(DELAY_REASONS as readonly string[]).includes(value)
	);
}

/** Blocking requires a blocker, the next step, and a canonical reason. */
export function canSubmitBlock(input: {
	blocker?: string;
	needs?: string;
	reason?: string;
}): boolean {
	return (
		(input.blocker ?? "").trim().length > 0 &&
		(input.needs ?? "").trim().length > 0 &&
		isDelayReason(input.reason)
	);
}

export type EpicPropertyState = "epic" | "child" | "none";

/** Which epic affordance the Inspector shows for this issue. */
export function epicPropertyState(input: {
	isEpic?: boolean;
	parent: EpicRef | null;
}): EpicPropertyState {
	if (input.isEpic) return "epic";
	return input.parent ? "child" : "none";
}

/** Link to an epic's detail page. `repo` is `owner/name`. */
export function epicHref(repo: string, number: number): string {
	return `/epics/${repo}/${number}`;
}

/** Writers only, and never while a write is in flight. */
export function canManage(mayWrite: boolean, busy = false): boolean {
	return mayWrite && !busy;
}

/** Convert a `datetime-local` value to the ISO string the delay API accepts. */
export function localToIso(value: string): string | null {
	if (value.trim().length === 0) return null;
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}
