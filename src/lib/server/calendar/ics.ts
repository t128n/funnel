/**
 * RFC 5545 rendering for the tokenized day-plan feed (SPEC §6).
 *
 * Pure file generation: every content line is CRLF-terminated and folded on
 * character boundaries at 75 octets, text values escape `\\ ; ,` and newlines,
 * and every time is an absolute UTC instant. The feed carries the viewer's
 * issue blocks (per `FUNNEL-<n> <title>`), explicit buffer blocks and blocked
 * windows over `today - 7` … `today + 42` in the viewer's timezone.
 */
import {
  issueRefKey,
  type DayWindow,
  type WorkHours,
} from "#lib/planning/availability";
import { addDaysISO, localDateOf, zonedToInstant } from "#lib/time/zoned";
import type { IssueTitle } from "#lib/server/planning/day-queries";
import type { DayBlock } from "#lib/server/planning/day-store";

const CRLF = "\r\n";
const FOLD_LIMIT = 75;
const DAYS_BEFORE = 7;
const DAYS_AFTER = 42;

const encoder = new TextEncoder();

/** One `VEVENT`, with raw (unescaped) text values and unix-ms instants. */
export interface CalendarEvent {
  uid: string;
  /** `DTSTAMP`, from the request's `now`. */
  stamp: number;
  start: number;
  end: number;
  summary: string;
  description: string | null;
}

/** Everything {@link buildCalendar} needs. */
export interface CalendarInput {
  events: readonly CalendarEvent[];
  /** Optional `X-WR-CALNAME`. */
  name?: string;
}

/** Everything {@link buildFeedEvents} needs; `hours` is `null` before setup. */
export interface FeedInput {
  hours: WorkHours | null;
  blocks: readonly DayBlock[];
  windows: readonly DayWindow[];
  titles: ReadonlyMap<string, IssueTitle>;
  now: number;
}

/**
 * Used when a viewer minted a token before saving any working hours: UTC, all
 * day, every weekday. There is no durable row to read, so the feed still works.
 */
const FALLBACK_HOURS: WorkHours = {
  timezone: "UTC",
  startMinute: 0,
  endMinute: 1440,
  workDays: [1, 2, 3, 4, 5, 6, 7],
  bufferPercent: 0,
};

/** Escape an RFC 5545 TEXT value: `\`, `;`, `,` and line breaks. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Fold one content line at 75 octets. Continuation lines start with a space
 * that counts toward their limit; code points are never split, so multi-byte
 * characters survive intact.
 */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = FOLD_LIMIT;

  for (const char of line) {
    const width = encoder.encode(char).length;
    if (bytes + width > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
      limit = FOLD_LIMIT - 1;
    }
    current += char;
    bytes += width;
  }
  parts.push(current);

  return parts.join(`${CRLF} `);
}

/** `YYYYMMDDTHHMMSSZ` for a unix-millisecond instant. */
export function formatUtc(instant: number): string {
  const iso = new Date(instant).toISOString();
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
}

/** Render a complete calendar file. */
export function buildCalendar(input: CalendarInput): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Funnel//Day Plan//EN",
    "CALSCALE:GREGORIAN",
  ];
  if (input.name) lines.push(`X-WR-CALNAME:${escapeText(input.name)}`);

  for (const event of input.events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeText(event.uid)}`,
      `DTSTAMP:${formatUtc(event.stamp)}`,
      `DTSTART:${formatUtc(event.start)}`,
      `DTEND:${formatUtc(event.end)}`,
      `SUMMARY:${escapeText(event.summary)}`,
    );
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    }
    lines.push("TRANSP:OPAQUE", "END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join(CRLF) + CRLF;
}

/** ISO weekday of a `YYYY-MM-DD` date: Monday 1 … Sunday 7. */
function isoWeekday(date: string): number {
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

/** `SUMMARY` and `DESCRIPTION` for one day block. */
function blockText(
  block: DayBlock,
  titles: ReadonlyMap<string, IssueTitle>,
): { summary: string; description: string | null } {
  if (block.kind !== "issue") {
    return { summary: "Buffer", description: null };
  }
  if (block.issueNumber === null) {
    return { summary: "Day block", description: null };
  }

  const meta = titles.get(
    issueRefKey(block.org ?? "", block.name ?? "", block.issueNumber),
  );
  const prefix = `FUNNEL-${block.issueNumber}`;
  return {
    summary: meta?.title ? `${prefix} ${meta.title}` : prefix,
    description: meta?.url || null,
  };
}

/**
 * One event per issue block, buffer block and blocked-window occurrence inside
 * `now ± 7/42` days in the viewer's zone. Empty days emit nothing. Sorted by
 * start time, then UID, so the file is deterministic for a given state.
 */
export function buildFeedEvents(input: FeedInput): CalendarEvent[] {
  const hours = input.hours ?? FALLBACK_HOURS;
  const tz = hours.timezone;
  const today = localDateOf(input.now, tz);
  const from = addDaysISO(today, -DAYS_BEFORE);
  const to = addDaysISO(today, DAYS_AFTER);
  const inRange = (date: string | null): date is string =>
    date !== null && date >= from && date <= to;

  const events: CalendarEvent[] = [];

  for (const block of input.blocks) {
    if (!inRange(block.date)) continue;
    const text = blockText(block, input.titles);
    events.push({
      uid: `state_day_block-${block.id}@funnel`,
      stamp: input.now,
      start: zonedToInstant(block.date, block.startMinute, tz),
      end: zonedToInstant(block.date, block.startMinute + block.minutes, tz),
      summary: text.summary,
      description: text.description,
    });
  }

  for (const window of input.windows) {
    const minutes = [window.startMinute, window.endMinute] as const;
    if (window.weekday !== null) {
      for (let date = from; date <= to; date = addDaysISO(date, 1)) {
        if (isoWeekday(date) !== window.weekday) continue;
        events.push({
          uid: `state_unavailable_window-${date}-${minutes[0]}-${minutes[1]}@funnel`,
          stamp: input.now,
          start: zonedToInstant(date, minutes[0], tz),
          end: zonedToInstant(date, minutes[1], tz),
          summary: window.label,
          description: null,
        });
      }
      continue;
    }

    if (!inRange(window.date)) continue;
    events.push({
      uid: `state_unavailable_window-${window.date}-${minutes[0]}-${minutes[1]}@funnel`,
      stamp: input.now,
      start: zonedToInstant(window.date, minutes[0], tz),
      end: zonedToInstant(window.date, minutes[1], tz),
      summary: window.label,
      description: null,
    });
  }

  return events.sort(
    (left, right) => left.start - right.start || left.uid.localeCompare(right.uid),
  );
}
