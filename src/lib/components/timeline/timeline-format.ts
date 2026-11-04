/**
 * Presentation helpers for the milestone timeline.
 *
 * Dates are UTC calendar days, matching the projection and the plan weeks.
 * Pure so the Svelte label column, the ECharts tooltip and the unit tests share
 * one definition; no DOM, no locale-dependent formatting.
 */
import type { TimelineRow } from "#lib/timeline";

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

const DAY_MS = 86_400_000;

/** Floor an instant to 00:00 UTC on its calendar day. */
export function utcDay(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

/** `23 Nov 2026`, or an em dash for an absent date. */
export function formatDay(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  const date = new Date(ms);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** `Nov`, used on the x-axis when the year is unambiguous. */
export function formatAxisMonth(ms: number): string {
  return MONTHS[new Date(ms).getMonth()] ?? "";
}

/** `Nov 2026`, used on the x-axis at a year boundary. */
export function formatAxisMonthYear(ms: number): string {
  const date = new Date(ms);
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** `Nov`, used in tooltips where the date is a UTC calendar day. */
export function formatMonth(ms: number): string {
  return MONTHS[new Date(ms).getUTCMonth()] ?? "";
}

/** `Nov 2026`, used on the x-axis at a year boundary and in tooltips. */
export function formatMonthYear(ms: number): string {
  const date = new Date(ms);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** `20%` from a 0..1 progress ratio. */
export function formatPercent(progress: number): string {
  const ratio = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  return `${Math.round(ratio * 100)}%`;
}

/** `2/10 closed`, the row and tooltip progress label. */
export function progressText(row: Pick<TimelineRow, "openIssues" | "closedIssues">): string {
  return `${row.closedIssues}/${row.openIssues + row.closedIssues} closed`;
}

/** A due date is overdue only while the milestone still has open work. */
export function isOverdue(
  row: Pick<TimelineRow, "dueOn" | "progress">,
  now: number,
): boolean {
  return row.dueOn !== null && utcDay(row.dueOn) < utcDay(now) && row.progress < 1;
}

/** A planned window that starts after its own due date; never clamped. */
export function isAfterDue(
  row: Pick<TimelineRow, "startOn" | "dueOn">,
): boolean {
  return row.startOn !== null && row.dueOn !== null && row.startOn > row.dueOn;
}

/** Escape user content before it enters an ECharts HTML tooltip. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

/**
 * One height shared by every label row and canvas band.
 *
 * A milestone label needs a title line plus a metadata line (and sometimes a
 * status badge), so a fixed 44px row clips the content. The label rows and the
 * ECharts bands must stay one-to-one, so every row gets the tallest measured
 * content plus its bottom border; the minimum keeps the original compact row
 * when a label happens to be short.
 */
export function timelineRowHeight(
  contentHeights: readonly number[],
  minimum = 44,
): number {
  let tallest = 0;
  for (const height of contentHeights) {
    if (Number.isFinite(height) && height > tallest) tallest = height;
  }
  return Math.max(minimum, Math.ceil(tallest) + 1);
}

/** `owner/name#number`, with the repo shortcode when one is configured. */
export function timelineRef(
  repo: string,
  number: number,
  repoShortcodes: Readonly<Record<string, string>> = {},
): string {
  return `${repoShortcodes[repo] ?? repo}#${number}`;
}
