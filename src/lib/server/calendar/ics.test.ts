/**
 * RFC 5545 rendering for the tokenized day-plan feed (SPEC §6).
 *
 * The generator is a pure file: escaping, octet folding, absolute UTC times
 * and one VEVENT per issue block, buffer block and blocked window.
 */
import { describe, expect, test } from "bun:test";
import { issueRefKey, type DayWindow, type WorkHours } from "#lib/planning/availability";
import type { DayBlock } from "#lib/server/planning/day-store";
import type { IssueTitle } from "#lib/server/planning/day-queries";
import {
  buildCalendar,
  buildFeedEvents,
  escapeText,
  foldLine,
  formatUtc,
  type CalendarEvent,
} from "./ics";

const BERLIN: WorkHours = {
  timezone: "Europe/Berlin",
  startMinute: 540,
  endMinute: 1020,
  workDays: [1, 2, 3, 4, 5],
  bufferPercent: 20,
};

/** Unix ms for a UTC wall time, for readable assertions. */
function utc(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return Date.UTC(year, month - 1, day, hour, minute);
}

function block(overrides: Partial<DayBlock> = {}): DayBlock {
  return {
    id: "block-1",
    date: "2026-10-25",
    startMinute: 540,
    minutes: 60,
    kind: "issue",
    org: "orgA",
    name: "core",
    issueNumber: 12,
    ...overrides,
  };
}

function window(overrides: Partial<DayWindow> = {}): DayWindow {
  return {
    label: "Lunch",
    weekday: 1,
    date: null,
    startMinute: 720,
    endMinute: 780,
    ...overrides,
  };
}

function titles(entries: Array<[string, IssueTitle]> = []): Map<string, IssueTitle> {
  return new Map(entries);
}

const ISSUE_TITLE: IssueTitle = {
  title: "Fix the feed",
  url: "https://github.com/orgA/core/issues/12",
};

describe("ICS text", () => {
  test("test_escape", () => {
    expect(escapeText("a,b;c\\d\n")).toBe("a\\,b\\;c\\\\d\\n");
    expect(escapeText("line\r\nbreak")).toBe("line\\nbreak");
  });

  test("test_fold", () => {
    const line = "a".repeat(200);
    const folded = foldLine(line);
    const lines = folded.split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    for (const part of lines) {
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });

  test("test_fold_multibyte", () => {
    const line = "ä".repeat(80);
    const folded = foldLine(line);
    for (const part of folded.split("\r\n")) {
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });

  test("test_utc", () => {
    expect(formatUtc(Date.UTC(2026, 9, 25, 9, 0))).toBe("20261025T090000Z");
    expect(formatUtc(utc(2026, 1, 2, 3, 4))).toBe("20260102T030400Z");
  });

  test("test_shape", () => {
    const event: CalendarEvent = {
      uid: "state_day_block-b1@funnel",
      stamp: utc(2026, 10, 25, 8, 0),
      start: utc(2026, 10, 25, 7, 0),
      end: utc(2026, 10, 25, 8, 0),
      summary: "FUNNEL-12 Fix, it",
      description: "https://github.com/orgA/core/issues/12",
    };
    const body = buildCalendar({ name: "Funnel day plan", events: [event] });

    expect(body.endsWith("\r\n")).toBe(true);
    expect(/(^|[^\r])\n/.test(body)).toBe(false);
    for (const line of body.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(body).toContain("BEGIN:VCALENDAR\r\n");
    expect(body).toContain("BEGIN:VEVENT\r\n");
    expect(body).toContain("UID:state_day_block-b1@funnel\r\n");
    expect(body).toContain("DTSTAMP:20261025T080000Z\r\n");
    expect(body).toContain("DTSTART:20261025T070000Z\r\n");
    expect(body).toContain("DTEND:20261025T080000Z\r\n");
    expect(body).toContain("SUMMARY:FUNNEL-12 Fix\\, it\r\n");
    expect(body).toContain("TRANSP:OPAQUE\r\n");
    expect(body).toContain("END:VEVENT\r\n");
    expect(body).toContain("END:VCALENDAR\r\n");
  });
});

describe("feed events", () => {
  test("test_local_to_utc", () => {
    const events = buildFeedEvents({
      hours: BERLIN,
      blocks: [block()],
      windows: [],
      titles: titles([[issueRefKey("orgA", "core", 12), ISSUE_TITLE]]),
      now: utc(2026, 10, 25, 12, 0),
    });

    expect(events).toHaveLength(1);
    // 2026-10-25 09:00 Berlin is CET (the EU transition is 03:00 that day),
    // so the correct UTC instant is 08:00Z; the day before is still CEST.
    expect(formatUtc(events[0].start)).toBe("20261025T080000Z");
    expect(formatUtc(events[0].end)).toBe("20261025T090000Z");

    const summer = buildFeedEvents({
      hours: BERLIN,
      blocks: [block({ date: "2026-10-24" })],
      windows: [],
      titles: titles([[issueRefKey("orgA", "core", 12), ISSUE_TITLE]]),
      now: utc(2026, 10, 24, 12, 0),
    });
    expect(formatUtc(summer[0].start)).toBe("20261024T070000Z");
    expect(events[0].summary).toBe("FUNNEL-12 Fix the feed");
    expect(events[0].uid).toBe("state_day_block-block-1@funnel");
    expect(events[0].description).toBe(ISSUE_TITLE.url);
  });

  test("test_empty_days_are_skipped", () => {
    expect(
      buildFeedEvents({
        hours: BERLIN,
        blocks: [],
        windows: [],
        titles: titles(),
        now: utc(2026, 10, 25, 12, 0),
      }),
    ).toEqual([]);
  });

  test("test_buffer_and_window_events", () => {
    const events = buildFeedEvents({
      hours: BERLIN,
      blocks: [
        block({
          id: "buffer-1",
          date: "2026-10-26",
          startMinute: 660,
          minutes: 90,
          kind: "buffer",
          org: null,
          name: null,
          issueNumber: null,
        }),
      ],
      windows: [window()],
      titles: titles(),
      now: utc(2026, 10, 25, 12, 0),
    });

    const buffer = events.find((event) => event.uid.includes("buffer-1"));
    expect(buffer?.summary).toBe("Buffer");
    expect(buffer?.description).toBeNull();

    const lunch = events.filter((event) => event.summary === "Lunch");
    // Window: 2026-10-18 … 2026-12-06, seven Mondays, one UID each so a
    // calendar client does not collapse them into a single event.
    expect(lunch).toHaveLength(7);
    expect(new Set(lunch.map((event) => event.uid)).size).toBe(7);
    for (const event of lunch) expect(event.uid).toContain("2026-");
  });

  test("test_one_off_window_and_range", () => {
    const events = buildFeedEvents({
      hours: BERLIN,
      blocks: [
        block({ id: "old", date: "2026-10-01" }),
        block({ id: "far", date: "2027-01-01" }),
      ],
      windows: [window({ label: "Dentist", weekday: null, date: "2026-10-25" })],
      titles: titles([[issueRefKey("orgA", "core", 12), ISSUE_TITLE]]),
      now: utc(2026, 10, 25, 12, 0),
    });

    expect(events.map((event) => event.uid)).toEqual([
      expect.stringContaining("state_unavailable_window"),
    ]);
    expect(events[0].summary).toBe("Dentist");
  });

  test("test_missing_title_falls_back", () => {
    const events = buildFeedEvents({
      hours: BERLIN,
      blocks: [block()],
      windows: [],
      titles: titles(),
      now: utc(2026, 10, 25, 12, 0),
    });
    expect(events[0].summary).toBe("FUNNEL-12");
    expect(events[0].description).toBeNull();
  });

  test("test_utc_fallback_without_hours", () => {
    const events = buildFeedEvents({
      hours: null,
      blocks: [block({ date: "2026-10-25" })],
      windows: [],
      titles: titles(),
      now: utc(2026, 10, 25, 12, 0),
    });
    expect(formatUtc(events[0].start)).toBe("20261025T090000Z");
  });
});
