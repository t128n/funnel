/**
 * Compact relative-time formatting for the dense UI (no dependency).
 * Falls back to an absolute `YYYY-MM-DD` date beyond a year.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const YEAR = 365 * DAY;

export function relativeTime(fromMs: number, nowMs: number = Date.now()): string {
  const delta = nowMs - fromMs;
  if (delta < MINUTE) return "just now";
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m ago`;
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h ago`;
  if (delta < YEAR) return `${Math.floor(delta / DAY)}d ago`;
  return new Date(fromMs).toISOString().slice(0, 10);
}

/** Absolute, unambiguous timestamp for `title` tooltips. */
export function absoluteTime(ms: number): string {
  return new Date(ms).toLocaleString();
}
