/**
 * Compact relative-time formatting for the dense UI (no dependency).
 * Falls back to the product's absolute date beyond a year.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const YEAR = 365 * DAY;

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

interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

/** Parse a `YYYY-MM-DD` date into its UTC calendar parts. */
function calendarDay(value: string): CalendarDay | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export function relativeTime(fromMs: number, nowMs: number = Date.now()): string {
  const delta = nowMs - fromMs;
  if (delta < MINUTE) return "just now";
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m ago`;
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h ago`;
  if (delta < WEEK) return `${Math.floor(delta / DAY)}d ago`;
  if (delta < YEAR) return `${Math.floor(delta / WEEK)}w ago`;
  return absoluteDate(new Date(fromMs).toISOString().slice(0, 10));
}

/**
 * The product's absolute date: `2026-11-02` → `2 Nov 2026`. Calendar dates
 * are parsed as UTC so the server and client agree. Malformed input is
 * returned unchanged.
 */
export function absoluteDate(value: string): string {
  const date = calendarDay(value);
  if (date === null) return value;
  return `${date.day} ${MONTHS[date.month - 1]} ${date.year}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Local wall-clock parts shared by the timestamp formatters. */
function timestampParts(ms: number): { date: string; time: string } | null {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return {
    date: `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
  };
}

/** `2 Nov 2026, 14:13` — the absolute timestamp shown in tables. */
export function absoluteDateTime(ms: number): string {
  const parts = timestampParts(ms);
  if (parts === null) return "";
  return `${parts.date}, ${parts.time.slice(0, 5)}`;
}

/**
 * `2 Nov 2026, 14:13:11` — the precise local timestamp for `title` tooltips.
 * Both values use the viewer's timezone and a fixed English format, so the
 * two sides of a delay always read the same way.
 */
export function absoluteTime(ms: number): string {
  const parts = timestampParts(ms);
  if (parts === null) return "";
  return `${parts.date}, ${parts.time}`;
}
