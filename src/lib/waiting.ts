/**
 * Shared vocabulary and day maths for the "waiting on someone else" state
 * (issue #32).
 *
 * A waiting issue is parked until the reporter, a vendor or an upstream
 * project responds. The state is Funnel-local (`state_issue_waiting`) and is
 * never written to GitHub: no body edit, no label, no comment. Keeping the
 * vocabulary and the stale threshold here lets the server store layer, the
 * Inspector control and the Attention view agree without importing server-only
 * modules into the browser bundle.
 */
import { daysBetween, toISODate } from "./attention";

/** The fixed set of reasons an issue can be waiting. */
export const WAITING_REASONS = [
  "needs-info",
  "waiting-on-reporter",
  "waiting-on-vendor",
  "waiting-on-upstream",
  "other",
] as const;

export type WaitingReason = (typeof WAITING_REASONS)[number];

/** Human labels used by the Inspector select and the Attention rows. */
export const WAITING_REASON_LABELS: Record<WaitingReason, string> = {
  "needs-info": "Needs info",
  "waiting-on-reporter": "Waiting on reporter",
  "waiting-on-vendor": "Waiting on vendor",
  "waiting-on-upstream": "Waiting on upstream",
  other: "Other",
};

/** Waits longer than this many calendar days are marked stale (#32). */
export const WAITING_STALE_DAYS = 7;

/** Whether an arbitrary value is one of the fixed waiting reasons. */
export function isWaitingReason(value: unknown): value is WaitingReason {
  return (
    typeof value === "string" &&
    (WAITING_REASONS as readonly string[]).includes(value)
  );
}

/** Label for a stored reason, falling back to `Other` for unknown values. */
export function waitingReasonLabel(reason: string): string {
  return isWaitingReason(reason)
    ? WAITING_REASON_LABELS[reason]
    : WAITING_REASON_LABELS.other;
}

/**
 * Whole local calendar days between when the wait began and `now`.
 * Negative values mean the stored timestamp is in the future.
 */
export function waitingDays(
  row: { waitingSince: number },
  now = Date.now(),
): number {
  return daysBetween(
    toISODate(new Date(row.waitingSince)),
    toISODate(new Date(now)),
  );
}

/**
 * Stale waits are older than {@link WAITING_STALE_DAYS} calendar days. Exactly
 * seven days is not stale; the next local day is. Calendar-day comparison
 * keeps the boundary stable across DST changes.
 */
export function isWaitingStale(
  row: { waitingSince: number },
  now = Date.now(),
): boolean {
  return waitingDays(row, now) > WAITING_STALE_DAYS;
}
