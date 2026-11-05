/**
 * Inbox snooze date helpers.
 *
 * Pure and DOM-free so the quick choices and the custom date input can be
 * tested without mounting a component. "Tomorrow" and "Next week" resolve to
 * 09:00 local time on the corresponding day, which reads as a morning
 * resurface rather than an arbitrary 24-hour offset. The server validates the
 * result again: a past or over-long date is rejected.
 */

/** Matches the server's one-year horizon. */
export const MAX_SNOOZE_HORIZON_MS = 365 * 86_400_000;

/** Local `YYYY-MM-DD` for a date, used by the date input's `min`. */
export function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function atMorning(date: Date): number {
  const copy = new Date(date);
  copy.setHours(9, 0, 0, 0);
  return copy.getTime();
}

/** Tomorrow at 09:00 local time. */
export function snoozeTomorrow(now = new Date()): number {
  const date = new Date(now);
  date.setDate(date.getDate() + 1);
  return atMorning(date);
}

/** One week from today at 09:00 local time. */
export function snoozeNextWeek(now = new Date()): number {
  const date = new Date(now);
  date.setDate(date.getDate() + 7);
  return atMorning(date);
}

/**
 * Parse a `YYYY-MM-DD` input value into 09:00 local time, or `null` when the
 * value is missing or not a real calendar date.
 */
export function snoozeCustomDate(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 9, 0, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date.getTime();
}

/** Earliest date the custom input offers: tomorrow. */
export function snoozeMinDate(now = new Date()): string {
  const date = new Date(now);
  date.setDate(date.getDate() + 1);
  return isoDate(date);
}
