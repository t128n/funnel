/**
 * Grouping for the Attention view (SPEC §5.1): blocked issues grouped by their
 * re-check date, computed in the browser's local timezone. Blocked issues with
 * no usable date land in `unscheduled` rather than disappearing.
 *
 * The re-check date is a plain `YYYY-MM-DD` string, so bucket membership and
 * day maths compare ISO strings (and UTC-parsed epochs) rather than local
 * `Date` objects, which keeps it DST-safe and trivially unit-testable.
 */

const RECHECK_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** The configurable triage rules that can raise an Attention breach. */
export const ATTENTION_RULES = [
  "first_response",
  "stale_open",
  "waiting",
  "recheck",
] as const;

export type AttentionRule = (typeof ATTENTION_RULES)[number];

/** Human labels shared by the Attention view, notifications and settings. */
export const ATTENTION_RULE_LABELS: Record<AttentionRule, string> = {
  first_response: "First response",
  stale_open: "Stale open",
  waiting: "Waiting",
  recheck: "Re-check",
};


/** True for a real `YYYY-MM-DD` calendar date, not just a matching shape. */
export function isValidISODate(value: string): boolean {
  if (!RECHECK_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

export interface AttentionBuckets<T> {
  overdue: T[];
  today: T[];
  upcoming: T[];
  /** Blocked items with no usable re-check date (missing or malformed). */
  unscheduled: T[];
}

/** Urgency of one blocked item, including items with no usable re-check date. */
export type AttentionUrgency = "overdue" | "today" | "upcoming" | "unscheduled";

/** Local `YYYY-MM-DD` for a moment in time. */
export function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Whole days from `from` to `to` (both `YYYY-MM-DD`). */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / DAY_MS);
}

/** `YYYY-MM-DD` shifted by `days`. */
export function addDaysISO(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** The Monday of the week containing `iso` (weeks run Monday → Friday). */
function mondayOf(iso: string): string {
  const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0=Sun .. 6=Sat
  return addDaysISO(iso, -((weekday + 6) % 7));
}

/** The Monday that starts the next business week (always strictly future). */
export function nextBusinessWeekStart(iso: string): string {
  return addDaysISO(mondayOf(iso), 7);
}

/**
 * The end of the current business week (Friday). On a weekend the current
 * week's Friday is already past, so it rolls forward to the next one.
 */
export function businessWeekEnd(iso: string): string {
  const friday = addDaysISO(mondayOf(iso), 4);
  return friday < iso ? addDaysISO(friday, 7) : friday;
}

/** A quick re-check anchor offered by the Block dialog and the Attention menu. */
export interface RecheckOption {
  label: string;
  /** `YYYY-MM-DD`. */
  value: string;
}

/**
 * Relative re-check anchors from a local "today", deduped so two anchors that
 * resolve to the same date on some days (e.g. "Tomorrow" and "Start of next
 * week" on a Friday) never repeat. Shared by the Block dialog and the Attention
 * row's reschedule menu so the two can't drift.
 */
export function quickRecheckDates(todayISO: string): RecheckOption[] {
  return dedupeByValue([
    { label: "Tomorrow", value: addDaysISO(todayISO, 1) },
    { label: "In 3 days", value: addDaysISO(todayISO, 3) },
    { label: "Start of next week", value: nextBusinessWeekStart(todayISO) },
    { label: "End of week", value: businessWeekEnd(todayISO) },
  ]);
}

/**
 * Bucket dated items into overdue / due today / upcoming within `windowDays`.
 * Items with a missing or malformed date go to `unscheduled` instead of
 * disappearing; valid dates further out are dropped, matching the "attention"
 * intent rather than listing every future reminder.
 */
export function classifyAttention<T extends { recheck: string }>(
  items: readonly T[],
  todayISO: string,
  windowDays = 7,
): AttentionBuckets<T> {
  const end = addDaysISO(todayISO, windowDays);
  const buckets: AttentionBuckets<T> = {
    overdue: [],
    today: [],
    upcoming: [],
    unscheduled: [],
  };
  for (const item of items) {
    if (!isValidISODate(item.recheck)) {
      buckets.unscheduled.push(item);
    } else if (item.recheck < todayISO) buckets.overdue.push(item);
    else if (item.recheck === todayISO) buckets.today.push(item);
    else if (item.recheck <= end) buckets.upcoming.push(item);
  }
  return buckets;
}

/**
 * Classify one item's urgency. Unlike `classifyAttention`, this does not apply
 * the seven-day window: it answers "how does this row read?" for rows already
 * selected by the feed.
 */
export function attentionUrgency(
  recheck: string,
  todayISO: string,
): AttentionUrgency {
  if (!isValidISODate(recheck)) return "unscheduled";
  const days = daysBetween(todayISO, recheck);
  return days < 0 ? "overdue" : days === 0 ? "today" : "upcoming";
}

/** The number of items that need action now (overdue plus due today). */
export function actionableCount<T>(buckets: AttentionBuckets<T>): number {
  return buckets.overdue.length + buckets.today.length;
}

/** Short human label for a re-check date relative to today. */
export function recheckLabel(recheck: string, todayISO: string): string {
  const days = daysBetween(todayISO, recheck);
  if (days === 0) return "Today";
  if (days < 0) return `${-days}d overdue`;
  return `in ${days}d`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
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
] as const;

/**
 * Absolute human label for a re-check date, e.g. "Wed 15 Oct 2026". Uses a
 * fixed English format (rather than `toLocaleDateString`) so the server and
 * client render identically and the output is unit-testable. A malformed date
 * is returned unchanged.
 */
export function recheckDateLabel(recheck: string): string {
  const date = new Date(`${recheck}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return recheck;
  const weekday = WEEKDAYS[date.getUTCDay()];
  const month = MONTHS[date.getUTCMonth()];
  return `${weekday} ${date.getUTCDate()} ${month} ${date.getUTCFullYear()}`;
}

/**
 * Keep the first option per `value`, dropping later duplicates. Used by the
 * Block dialog's quick-date actions, where two anchors (e.g. "Tomorrow" and
 * "Start of next week") can resolve to the same date on some days.
 */
export function dedupeByValue<T extends { value: string }>(
  options: readonly T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const option of options) {
    if (seen.has(option.value)) continue;
    seen.add(option.value);
    out.push(option);
  }
  return out;
}
