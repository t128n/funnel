import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import { authUser } from "#lib/server/db/schema";
import { resetPlanning } from "#tests/planning-helpers";
import type { DayWindow, WorkHours } from "#lib/planning/availability";
import {
	readCalendarFeed,
	readWorkHours,
	replaceDayBlocks,
	replaceWindows,
	listDayBlocks,
	listWindows,
	revokeCalendarFeed,
	rotateCalendarFeed,
	writeWorkHours,
} from "./day-store";
import { findCalendarFeed } from "./day-queries";

const USER = "day_store_user";

function seedUser(id = USER): void {
  const now = new Date();
  db.insert(authUser)
    .values({
      id,
      name: id,
      email: `${id}@example.com`,
      emailVerified: true,
      role: "read",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run();
}

const HOURS: WorkHours = {
  timezone: "Europe/Berlin",
  startMinute: 540,
  endMinute: 1020,
  workDays: [1, 2, 3, 4, 5],
  bufferPercent: 20,
};

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

describe("day store", () => {
  beforeEach(() => {
    resetPlanning();
    seedUser();
  });

  afterEach(() => {
    db.delete(authUser).where(eq(authUser.id, USER)).run();
    resetPlanning();
  });

  test("test_hours_round_trip", () => {
    expect(readWorkHours(USER)).toBeNull();

    writeWorkHours(USER, HOURS);

    expect(readWorkHours(USER)).toEqual(HOURS);

    writeWorkHours(USER, { ...HOURS, endMinute: 1080, workDays: [2, 4] });
    expect(readWorkHours(USER)).toEqual({
      ...HOURS,
      endMinute: 1080,
      workDays: [2, 4],
    });
  });

  test("test_windows_replace", () => {
    replaceWindows(USER, [window()]);
    expect(listWindows(USER)).toHaveLength(1);

    const school = window({
      label: "School",
      weekday: 3,
      startMinute: 900,
      endMinute: 960,
    });
    replaceWindows(USER, [school]);

    const rows = listWindows(USER);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(school);

    // Other viewers keep their own rows.
    seedUser("day_store_other");
    replaceWindows("day_store_other", [window({ label: "Other" })]);
    expect(listWindows(USER)).toEqual([school]);
    expect(listWindows("day_store_other")[0].label).toBe("Other");
    db.delete(authUser).where(eq(authUser.id, "day_store_other")).run();
  });

  test("test_blocks_range", () => {
    replaceDayBlocks(USER, "2026-10-25", [
      {
        startMinute: 540,
        minutes: 60,
        kind: "issue",
        org: "orgA",
        name: "core",
        issueNumber: 1,
      },
      {
        startMinute: 660,
        minutes: 90,
        kind: "buffer",
        org: null,
        name: null,
        issueNumber: null,
      },
    ]);
    replaceDayBlocks(USER, "2026-10-26", [
      {
        startMinute: 600,
        minutes: 30,
        kind: "buffer",
        org: null,
        name: null,
        issueNumber: null,
      },
    ]);

    // `from === to` is inclusive: exactly that one date.
    const day = listDayBlocks(USER, "2026-10-25", "2026-10-25");
    expect(day).toHaveLength(2);
    expect(day.every((block) => block.date === "2026-10-25")).toBe(true);
    expect(day.map((block) => block.startMinute)).toEqual([540, 660]);
    expect(day[0]).toMatchObject({
      kind: "issue",
      org: "orgA",
      name: "core",
      issueNumber: 1,
      minutes: 60,
    });
    expect(typeof day[0].id).toBe("string");

    // Replacing a day deletes the old rows.
    replaceDayBlocks(USER, "2026-10-25", [
      {
        startMinute: 780,
        minutes: 45,
        kind: "buffer",
        org: null,
        name: null,
        issueNumber: null,
      },
    ]);
    const replaced = listDayBlocks(USER, "2026-10-25", "2026-10-25");
    expect(replaced).toHaveLength(1);
    expect(replaced[0].startMinute).toBe(780);
    expect(listDayBlocks(USER, "2026-10-25", "2026-10-26")).toHaveLength(2);

    // Another viewer never sees these rows.
    seedUser("day_store_other");
    expect(listDayBlocks("day_store_other", "2026-10-25", "2026-10-26")).toEqual(
      [],
    );
    db.delete(authUser).where(eq(authUser.id, "day_store_other")).run();
  });

  test("test_token", () => {
    const token = rotateCalendarFeed(USER);
    expect(token.token).toHaveLength(43);
    expect(token.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.hint).toBe(token.token.slice(0, 8));
    expect(typeof token.createdAt).toBe("number");

    const feed = readCalendarFeed(USER);
    expect(feed).toEqual({ hint: token.token.slice(0, 8), createdAt: token.createdAt });

    // Only the hash and the hint are stored, never the raw token.
    const stored = JSON.stringify(
      db.$client.query("SELECT * FROM state_calendar_feed").all(),
    );
    expect(stored).not.toContain(token.token);

    expect(findCalendarFeed(token.token)).toEqual({ userId: USER });
    // Outlook appends `.ics` to the URL path.
    expect(findCalendarFeed(`${token.token}.ics`)).toEqual({ userId: USER });
    expect(findCalendarFeed("unknown")).toBeNull();

    const rotated = rotateCalendarFeed(USER);
    expect(rotated.token).not.toBe(token.token);
    expect(findCalendarFeed(token.token)).toBeNull();
    expect(findCalendarFeed(rotated.token)).toEqual({ userId: USER });

    revokeCalendarFeed(USER);
    expect(readCalendarFeed(USER)).toBeNull();
    expect(findCalendarFeed(rotated.token)).toBeNull();
    // Idempotent.
    revokeCalendarFeed(USER);
  });
});
