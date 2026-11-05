/**
 * Pure triage analytics (issue #36).
 *
 * The Insights view answers "how old is the inbox, how long until triage and
 * close, what throughput do we have, and how much work is stale or ageing?"
 * Every definition here is deterministic and intentionally boring so two
 * reports over the same data compare directly.
 *
 * Two clocks are deliberately separate:
 *
 *  - **snapshot** metrics (inbox age, WIP, stale waits, backlog aging) describe
 *    the database *now*;
 *  - **range** metrics (time to first triage, time to close, throughput)
 *    include events whose timestamp falls in a UTC calendar range.
 *
 * There is no business-day or working-hours arithmetic in this module. Range
 * metrics use UTC calendar dates and plain elapsed milliseconds; the UI is free
 * to render durations as hours or days. The stale-waiting snapshot is the one
 * exception: it reuses the #32 local-calendar helper so Insights and Attention
 * agree on that threshold.
 */
import { addDaysISO, daysBetween, isValidISODate } from "#lib/attention";
import { isWaitingStale, WAITING_STALE_DAYS } from "#lib/waiting";

export const DAY_MS = 86_400_000;

/** The default window is the last 30 calendar days, including today. */
export const DEFAULT_RANGE_DAYS = 30;

/** Triage actions that count as a decision. `undone` never does. */
export const DECISION_ACTIONS = ["accepted", "dismissed", "duplicated"] as const;

export type DecisionAction = (typeof DECISION_ACTIONS)[number];

/** A resolved `?from=&to=` range, inclusive in calendar-date terms. */
export interface ResolvedRange {
  /** First included UTC calendar date (`YYYY-MM-DD`). */
  from: string;
  /** Last included UTC calendar date (`YYYY-MM-DD`). */
  to: string;
  /** Inclusive start instant (`fromT00:00:00Z`). */
  start: number;
  /** Exclusive end instant (`to + 1 day`, at 00:00Z). */
  end: number;
  /** True when malformed or reversed input was replaced by the default. */
  fallback: boolean;
  /** Raw values as received, for an honest "we ignored this" notice. */
  requested: { from: string | null; to: string | null };
}

export interface DurationStats {
  count: number;
  /** Null when there are no samples, never NaN. */
  medianMs: number | null;
  /** Null when there are no samples, never NaN. */
  p90Ms: number | null;
}

export interface InboxAgeStats extends DurationStats {
  /** Oldest pending age in whole days, or null when the inbox is empty. */
  oldestDays: number | null;
  /** Oldest pending age in milliseconds, or null when the inbox is empty. */
  oldestMs: number | null;
}

export interface ThroughputDay {
  /** UTC `YYYY-MM-DD`. */
  date: string;
  /** Accepted/dismissed/duplicated triage decisions on this day. */
  decisions: number;
  /** Issues whose `closed_at` fell on this day. */
  closed: number;
}

export interface ThroughputStats {
  /** Every day in the range, including zero-filled days. */
  days: ThroughputDay[];
  totalDecisions: number;
  totalClosed: number;
}

export interface WipStats {
  total: number;
  byStatus: {
    "in-progress": number;
    "in-review": number;
  };
}

export interface StaleStats {
  count: number;
  /** The #32 waiting threshold: more than this many calendar days. */
  thresholdDays: number;
}

export type BacklogBucketKey = "0-7" | "8-30" | "31-90" | "91+";

export interface BacklogBucket {
  key: BacklogBucketKey;
  label: string;
  count: number;
}

export interface BacklogAging {
  buckets: BacklogBucket[];
  total: number;
}

export interface InsightsMetrics {
  range: ResolvedRange;
  repo: string | null;
  /** The snapshot clock used for age, WIP, stale and backlog metrics. */
  generatedAt: number;
  /** Snapshot: pending intake submissions that are not snoozed. */
  inbox: InboxAgeStats;
  /** Range: submission created → first non-undone decision. */
  firstTriage: DurationStats;
  /** Range: issue created → closed, for issues closed in the range. */
  timeToClose: DurationStats;
  /** Range: daily decision and close counts, zero-filled. */
  throughput: ThroughputStats;
  /** Snapshot: open issues in `in-progress` or `in-review`. */
  wip: WipStats;
  /** Snapshot: open waiting issues past the #32 stale threshold. */
  stale: StaleStats;
  /** Snapshot: open backlog/todo/unset issues by age since creation. */
  backlog: BacklogAging;
}

/** A staged intake submission, reduced to the fields metrics need. */
export interface SubmissionRow {
  id: string;
  createdAt: number;
}

/** One triage event. `undone` rows are accepted and ignored by the maths. */
export interface TriageEventRow {
  submissionId: string;
  action: string;
  createdAt: number;
  /** `owner/name` for accepted/duplicated decisions; null for dismissals. */
  repo?: string | null;
}

/** A mirrored issue that may have closed inside the range. */
export interface ClosedIssueRow {
  createdAt: number;
  closedAt: number | null;
}

/** A mirrored open issue reduced to the snapshot fields. */
export interface OpenIssueRow {
  repo: string;
  number: number;
  status: string | null;
  createdAt: number;
}

/** One open waiting row. */
export interface WaitingRow {
  repo: string;
  number: number;
  waitingSince: number;
}

/** All rows the arithmetic needs. The loader scopes them by repo first. */
export interface MetricsInput {
  /** Pending submissions after archive and snooze filtering. */
  pendingSubmissions: readonly { createdAt: number }[];
  /** Every submission, so the loader can find a first-decision origin. */
  submissions: readonly SubmissionRow[];
  /** Triage events; `undone` entries are ignored here as well. */
  decisions: readonly TriageEventRow[];
  /** Mirrored issues, possibly narrowed to the range by the loader. */
  closedIssues: readonly ClosedIssueRow[];
  /** Mirrored open issues for the snapshot metrics. */
  openIssues: readonly OpenIssueRow[];
  /** Waiting rows; only open issue keys are counted. */
  waiting: readonly WaitingRow[];
}

const BACKLOG_BUCKETS: readonly {
  key: BacklogBucketKey;
  label: string;
}[] = [
  { key: "0-7", label: "0–7 days" },
  { key: "8-30", label: "8–30 days" },
  { key: "31-90", label: "31–90 days" },
  { key: "91+", label: "91+ days" },
];

/** Stable key for an `owner/name#number` issue. */
export function issueKey(repo: string, number: number): string {
  return `${repo}\u0000${number}`;
}

function validTimestamp(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function utcDate(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

/**
 * Resolve a requested range. Both endpoints are optional: a missing endpoint
 * takes the default boundary. A malformed or reversed pair is replaced by the
 * full default range and marked `fallback`, so a bad link never fails a page.
 */
export function resolveDateRange(
  fromRaw?: string | null,
  toRaw?: string | null,
  now = Date.now(),
): ResolvedRange {
  const today = utcDate(now);
  const defaultTo = today;
  const defaultFrom = addDaysISO(today, -(DEFAULT_RANGE_DAYS - 1));
  const requestedFrom = fromRaw?.trim() || null;
  const requestedTo = toRaw?.trim() || null;

  let from = requestedFrom ?? defaultFrom;
  let to = requestedTo ?? defaultTo;
  let fallback = false;

  const valid =
    isValidISODate(from) && isValidISODate(to) && from <= to;
  if (!valid) {
    from = defaultFrom;
    to = defaultTo;
    // A missing pair is simply the default; anything present and rejected is
    // worth reporting, even if it happened to match the default.
    fallback = requestedFrom !== null || requestedTo !== null;
  }

  return {
    from,
    to,
    start: Date.parse(`${from}T00:00:00Z`),
    end: Date.parse(`${addDaysISO(to, 1)}T00:00:00Z`),
    fallback,
    requested: { from: requestedFrom, to: requestedTo },
  };
}

/** Whether an instant belongs to the half-open range `[start, end)`. */
export function inRange(at: number | null, range: ResolvedRange): boolean {
  return (
    at !== null &&
    Number.isFinite(at) &&
    at >= range.start &&
    at < range.end
  );
}

/** Percentile with linear interpolation between closest ranks (0..1). */
export function quantile(
  values: readonly number[],
  p: number,
): number | null {
  const clean = values.filter(
    (value) => Number.isFinite(value) && value >= 0,
  );
  if (clean.length === 0) return null;
  const sorted = [...clean].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const clamped = Math.min(1, Math.max(0, p));
  const position = (sorted.length - 1) * clamped;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return (
    sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
  );
}

/** Median sample of a duration list. Null for an empty list. */
export function median(values: readonly number[]): number | null {
  return quantile(values, 0.5);
}

/** 90th percentile sample of a duration list. Null for an empty list. */
export function p90(values: readonly number[]): number | null {
  return quantile(values, 0.9);
}

/** Summarise duration samples (milliseconds) as count, median and p90. */
export function durationStats(values: readonly number[]): DurationStats {
  const clean = values.filter(
    (value) => Number.isFinite(value) && value >= 0,
  );
  return {
    count: clean.length,
    medianMs: median(clean),
    p90Ms: p90(clean),
  };
}

/**
 * Snapshot inbox age: now minus `created_at` for each pending submission.
 * Invalid creation timestamps are skipped rather than producing NaN.
 */
export function inboxAge(
  pending: readonly { createdAt: number }[],
  now = Date.now(),
): InboxAgeStats {
  const ages = pending
    .filter((row) => validTimestamp(row.createdAt))
    .map((row) => Math.max(0, now - row.createdAt));
  const stats = durationStats(ages);
  const oldestMs = ages.length === 0 ? null : Math.max(...ages);
  return {
    ...stats,
    oldestMs,
    oldestDays:
      oldestMs === null ? null : Math.floor(oldestMs / DAY_MS),
  };
}

/**
 * Range time to first triage.
 *
 * For every submission, the *earliest* non-`undone` decision is found first;
 * only then is it tested against the range. This matters when a submission was
 * triaged before the window but another event landed inside it. A decision whose
 * submission row is missing is skipped.
 */
export function firstTriageDurations(
  submissions: readonly SubmissionRow[],
  decisions: readonly TriageEventRow[],
  range: ResolvedRange,
  repo: string | null = null,
): DurationStats {
  const earliest = new Map<
    string,
    { createdAt: number; repo: string | null }
  >();
  for (const event of decisions) {
    if (!(DECISION_ACTIONS as readonly string[]).includes(event.action)) {
      continue;
    }
    if (!validTimestamp(event.createdAt)) continue;
    const previous = earliest.get(event.submissionId);
    if (previous === undefined || event.createdAt < previous.createdAt) {
      earliest.set(event.submissionId, {
        createdAt: event.createdAt,
        repo: event.repo ?? null,
      });
    }
  }

  const byId = new Map(submissions.map((row) => [row.id, row]));
  const durations: number[] = [];
  for (const [submissionId, decision] of earliest) {
    if (!inRange(decision.createdAt, range)) continue;
    // The repo scope applies to the *first* decision. A submission dismissed
    // without a repo is never counted under a repo filter, even if a later
    // accepted event names that repo.
    if (repo !== null && decision.repo !== repo) continue;
    const submission = byId.get(submissionId);
    if (!submission || !validTimestamp(submission.createdAt)) continue;
    durations.push(Math.max(0, decision.createdAt - submission.createdAt));
  }
  return durationStats(durations);
}

/** Range time to close: `closed_at - created_at` for in-range closes. */
export function closeDurations(
  issues: readonly ClosedIssueRow[],
  range: ResolvedRange,
): DurationStats {
  const durations: number[] = [];
  for (const issue of issues) {
    if (!inRange(issue.closedAt, range)) continue;
    if (!validTimestamp(issue.createdAt)) continue;
    const closedAt = issue.closedAt as number;
    durations.push(Math.max(0, closedAt - issue.createdAt));
  }
  return durationStats(durations);
}

/** Every UTC day in the inclusive calendar range, in order. */
export function rangeDays(range: ResolvedRange): string[] {
  const total = daysBetween(range.from, range.to);
  const days: string[] = [];
  for (let offset = 0; offset <= total; offset += 1) {
    days.push(addDaysISO(range.from, offset));
  }
  return days;
}

/**
 * Range throughput: triage decisions and closed issues per UTC day, with every
 * day in the range present (zero-filled). Both series are counts, never rates.
 */
export function throughput(
  decisions: readonly TriageEventRow[],
  closedIssues: readonly ClosedIssueRow[],
  range: ResolvedRange,
  repo: string | null = null,
): ThroughputStats {
  const days = rangeDays(range);
  const index = new Map(days.map((date, offset) => [date, offset]));
  const points: ThroughputDay[] = days.map((date) => ({
    date,
    decisions: 0,
    closed: 0,
  }));

  for (const event of decisions) {
    if (!(DECISION_ACTIONS as readonly string[]).includes(event.action)) {
      continue;
    }
    if (repo !== null && (event.repo ?? null) !== repo) continue;
    if (!inRange(event.createdAt, range)) continue;
    const offset = index.get(utcDate(event.createdAt));
    if (offset !== undefined) points[offset].decisions += 1;
  }

  for (const issue of closedIssues) {
    if (!inRange(issue.closedAt, range)) continue;
    const offset = index.get(utcDate(issue.closedAt as number));
    if (offset !== undefined) points[offset].closed += 1;
  }

  return {
    days: points,
    totalDecisions: points.reduce((sum, day) => sum + day.decisions, 0),
    totalClosed: points.reduce((sum, day) => sum + day.closed, 0),
  };
}

/** Snapshot WIP: open issues in `in-progress` or `in-review`. */
export function wip(openIssues: readonly OpenIssueRow[]): WipStats {
  const byStatus = { "in-progress": 0, "in-review": 0 };
  for (const issue of openIssues) {
    if (issue.status === "in-progress") byStatus["in-progress"] += 1;
    else if (issue.status === "in-review") byStatus["in-review"] += 1;
  }
  return {
    total: byStatus["in-progress"] + byStatus["in-review"],
    byStatus,
  };
}

/**
 * Snapshot stale waiting count. Only waiting rows whose issue is still open are
 * considered (the caller passes the open key set), and the threshold is the
 * shared #32 calendar-day rule: exactly seven days is not stale, eight is.
 */
export function staleWaitingCount(
  waiting: readonly WaitingRow[],
  openKeys: ReadonlySet<string>,
  now = Date.now(),
): number {
  let count = 0;
  for (const row of waiting) {
    if (!openKeys.has(issueKey(row.repo, row.number))) continue;
    if (isWaitingStale({ waitingSince: row.waitingSince }, now)) count += 1;
  }
  return count;
}

/** Snapshot backlog aging: open, unstarted issues by age in whole days. */
export function backlogAging(
  openIssues: readonly OpenIssueRow[],
  now = Date.now(),
): BacklogAging {
  const counts: Record<BacklogBucketKey, number> = {
    "0-7": 0,
    "8-30": 0,
    "31-90": 0,
    "91+": 0,
  };

  for (const issue of openIssues) {
    const status = issue.status?.trim().toLowerCase() ?? "";
    if (status !== "" && status !== "backlog" && status !== "todo") continue;
    if (!validTimestamp(issue.createdAt)) continue;
    const age = Math.floor(
      Math.max(0, now - issue.createdAt) / DAY_MS,
    );
    if (age <= 7) counts["0-7"] += 1;
    else if (age <= 30) counts["8-30"] += 1;
    else if (age <= 90) counts["31-90"] += 1;
    else counts["91+"] += 1;
  }

  const buckets = BACKLOG_BUCKETS.map((bucket) => ({
    ...bucket,
    count: counts[bucket.key],
  }));
  return {
    buckets,
    total: buckets.reduce((sum, bucket) => sum + bucket.count, 0),
  };
}

/** Compute every metric from already-scoped rows. */
export function computeInsights(
  input: MetricsInput,
  range: ResolvedRange,
  now = Date.now(),
  repo: string | null = null,
): InsightsMetrics {
  const openKeys = new Set(
    input.openIssues.map((issue) => issueKey(issue.repo, issue.number)),
  );
  return {
    range,
    repo,
    generatedAt: now,
    inbox: inboxAge(input.pendingSubmissions, now),
    firstTriage: firstTriageDurations(
      input.submissions,
      input.decisions,
      range,
      repo,
    ),
    timeToClose: closeDurations(input.closedIssues, range),
    throughput: throughput(input.decisions, input.closedIssues, range, repo),
    wip: wip(input.openIssues),
    stale: {
      count: staleWaitingCount(input.waiting, openKeys, now),
      thresholdDays: WAITING_STALE_DAYS,
    },
    backlog: backlogAging(input.openIssues, now),
  };
}

/** Metrics for no data at all: valid empty values, never NaN. */
export function emptyInsights(
  range: ResolvedRange,
  now = Date.now(),
  repo: string | null = null,
): InsightsMetrics {
  return computeInsights(
    {
      pendingSubmissions: [],
      submissions: [],
      decisions: [],
      closedIssues: [],
      openIssues: [],
      waiting: [],
    },
    range,
    now,
    repo,
  );
}
