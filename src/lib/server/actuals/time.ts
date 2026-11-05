/**
 * Actual-time arithmetic (SPEC §1).
 *
 * Pure functions: the store loads `state_issue_event` rows and delay intervals,
 * and these turn them into the minutes the Inspector and epic rollups show.
 * Actual time is the union of intervals where the issue is open and its status
 * is `in-progress` or `in-review`; closing ends the interval at `closedAt` when
 * known, otherwise at the close event. Delay time is the union of the delay
 * intervals, so an automatic and a manual delay that overlap count once.
 *
 * There is no historical backfill: the first observation's baseline events
 * start the clock, and an open interval ends at `now`.
 */

/** One entry of the durable `state_issue_event` log. */
export interface IssueEvent {
  /** Stable row id when loaded from the store; synthetic in pure tests. */
  id?: string;
  /** `status` | `state` | `blocked` | `priority` | `label` | `assignee`. */
  kind: "status" | "state" | "blocked" | "priority" | "label" | "assignee";
  fromValue: string | null;
  toValue: string | null;
  /** Unix milliseconds. */
  at: number;
  /** `migration` | `sync`; unused by the arithmetic. */
  source?: string;
}

/** Half-open `[start, end)`; `end === null` means the interval is still open. */
export interface TimeInterval {
  start: number;
  end: number | null;
}

/** An interval with both ends resolved to unix milliseconds. */
export interface ClosedInterval {
  start: number;
  end: number;
}

/** The delay columns the arithmetic needs (a `state_issue_delay` row). */
export interface DelayInterval {
  startedAt: number;
  endedAt: number | null;
}

/** Statuses that count as active work. */
const ACTIVE_STATUSES = new Set(["in-progress", "in-review"]);

/** Whole minutes between two instants, clamped at zero and rounded. */
function minutesBetween(start: number, end: number): number {
  return Math.max(0, Math.round((end - start) / 60_000));
}

/**
 * The intervals during which the issue was open and its status was active.
 *
 * Events are walked in timestamp order; each `status`/`state` event moves the
 * machine between active and idle. A close ends the current interval at
 * `closedAt ?? event.at` (clamped so it never precedes the start); an interval
 * still open at the end runs to `now`. `closedAt` describes only the issue's
 * latest close, so earlier closes in a close/reopen/close history end at their
 * own event time. `blocked` events are ignored here.
 */
export function activeIntervals(
  events: readonly IssueEvent[],
  now: number,
  closedAt: number | null = null,
): ClosedInterval[] {
  const ordered = [...events].sort((a, b) => a.at - b.at);
  // The forge close time belongs to the last close event only; applying it to
  // an earlier close would swallow the idle gap before a reopen.
  let lastClose = -1;
  for (let index = 0; index < ordered.length; index += 1) {
    const event = ordered[index];
    if (event.kind === "state" && event.toValue === "closed") lastClose = index;
  }
  const intervals: ClosedInterval[] = [];
  let status: string | null = null;
  let open = true;
  let since: number | null = null;

  const isActive = () =>
    open && status !== null && ACTIVE_STATUSES.has(status);

  const sync = (at: number) => {
    if (isActive()) {
      if (since === null) since = at;
    } else if (since !== null) {
      const end = Math.max(since, at);
      if (end > since) intervals.push({ start: since, end });
      since = null;
    }
  };

  for (let index = 0; index < ordered.length; index += 1) {
    const event = ordered[index];
    if (event.kind === "status") {
      status = event.toValue;
      sync(event.at);
      continue;
    }
    if (event.kind === "state") {
      if (event.toValue === "closed") {
        open = false;
        sync(index === lastClose ? (closedAt ?? event.at) : event.at);
      } else {
        open = true;
        sync(event.at);
      }
    }
  }

  if (since !== null) {
    const end = Math.max(since, now);
    if (end > since) intervals.push({ start: since, end });
  }
  return intervals;
}

/**
 * Sort and merge overlapping or touching intervals. Open intervals (`end ===
 * null`) are resolved against `now`; empty and inverted intervals are dropped.
 */
export function mergeIntervals(
  intervals: readonly TimeInterval[],
  now: number,
): ClosedInterval[] {
  const resolved = intervals
    .map((interval) => ({
      start: interval.start,
      end: interval.end ?? now,
    }))
    .filter(
      (interval) =>
        Number.isFinite(interval.start) &&
        Number.isFinite(interval.end) &&
        interval.end > interval.start,
    )
    .sort((a, b) => a.start - b.start);

  const merged: ClosedInterval[] = [];
  for (const interval of resolved) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

/** Total whole minutes covered by already-merged intervals. */
export function totalMinutes(intervals: readonly ClosedInterval[]): number {
  let milliseconds = 0;
  for (const interval of intervals) {
    milliseconds += Math.max(0, interval.end - interval.start);
  }
  return Math.round(milliseconds / 60_000);
}

/** The time summary the Inspector and epic rollups render (SPEC §1). */
export interface IssueTime {
  actualMinutes: number;
  delayMinutes: number;
  estimateMinutes: number | null;
  /** `actual - estimate`; `null` when the issue has no size estimate. */
  varianceMinutes: number | null;
  /** Opened → closed/now. `0` when the opening time is unknown. */
  leadMinutes: number;
  /** First active → closed/now. `0` when the issue was never active. */
  cycleMinutes: number;
  /** Number of delay rows, before merging overlaps. */
  delayCount: number;
}

export interface ComputeIssueTimeInput {
  events?: readonly IssueEvent[];
  delays?: readonly DelayInterval[];
  estimateMinutes?: number | null;
  /** The issue's forge `createdAt`, or `null` when unknown. */
  openedAt?: number | null;
  closedAt?: number | null;
  now?: number;
}

/** Build the time summary from observed events and delay intervals. */
export function computeIssueTime(
  input: ComputeIssueTimeInput,
): IssueTime {
  const now = input.now ?? Date.now();
  const closedAt = input.closedAt ?? null;
  const delays = input.delays ?? [];

  const active = mergeIntervals(
    activeIntervals(input.events ?? [], now, closedAt),
    now,
  );
  const delayIntervals = mergeIntervals(
    delays.map((delay) => ({
      start: delay.startedAt,
      end: delay.endedAt,
    })),
    now,
  );

  const actualMinutes = totalMinutes(active);
  const delayMinutes = totalMinutes(delayIntervals);
  const estimateMinutes = input.estimateMinutes ?? null;
  const end = closedAt ?? now;
  const leadMinutes =
    input.openedAt === null || input.openedAt === undefined
      ? 0
      : minutesBetween(input.openedAt, end);
  const cycleMinutes =
    active.length === 0 ? 0 : minutesBetween(active[0].start, end);

  return {
    actualMinutes,
    delayMinutes,
    estimateMinutes,
    varianceMinutes:
      estimateMinutes === null ? null : actualMinutes - estimateMinutes,
    leadMinutes,
    cycleMinutes,
    delayCount: delays.length,
  };
}

/**
 * Parse an API timestamp: unix milliseconds (number) or an ISO 8601 string.
 * Returns `null` for anything else, including negative numbers.
 */
export function parseTimestamp(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
