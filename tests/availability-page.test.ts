/**
 * `/settings/availability` load, access control and the shape of the page
 * contract (SPEC §8).
 *
 * The page is personal state: any signed-in role may read and edit their own
 * hours, windows and feed. The load is exercised against the shared in-memory
 * DB; the page source is checked statically for the API endpoints it posts to
 * and for the rule that the raw feed URL only ever comes from the POST
 * response, never from a page load.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { db } from "#lib/server/db/index";
import { authUser, stateSetting } from "#lib/server/db/schema";
import {
  DEFAULT_WORK_HOURS,
  hoursFromDefaults,
} from "#lib/planning/availability";
import {
  replaceWindows,
  revokeCalendarFeed,
  rotateCalendarFeed,
  writeWorkHours,
} from "#lib/server/planning/day-store";
import { clearSettings } from "#lib/server/settings/store";
import type { Role } from "#lib/roles";
import { settingsGroups } from "#lib/components/settings/sections";
import { load as loadSettingsLayout } from "#/routes/(app)/settings/+layout.server";
import {
  load as loadAvailabilityPage,
  _loadAvailability,
} from "#/routes/(app)/settings/availability/+page.server";

const USER = {
  id: "availability-page-user",
  name: "Availability Page",
  email: "availability@example.com",
  image: null,
  role: "read" as Role,
};

function locals(user: typeof USER | null = USER) {
  return { user, session: null };
}

function url(path: string): URL {
  return new URL(`http://x${path}`);
}

function source(relative: string): string {
  return readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");
}

beforeEach(() => {
  const now = new Date();
  db.insert(authUser)
    .values({
      id: USER.id,
      name: USER.name,
      email: USER.email,
      emailVerified: true,
      role: "read",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run();
});

afterEach(() => {
  revokeCalendarFeed(USER.id);
  clearSettings();
});

describe("availability access", () => {
  test("test_read_role", async () => {
    // The settings layout lets a read viewer open only the personal sections.
    await loadSettingsLayout({
      locals: locals(),
      url: url("/settings/availability"),
    } as never);

    // A read viewer can load their own availability.
    const data = await loadAvailabilityPage({
      locals: locals(),
      url: url("/settings/availability"),
    } as never);
    expect(data.hours).toEqual(DEFAULT_WORK_HOURS);

    // Admin sections still reject the same viewer with 403.
    let caught: unknown;
    try {
      await loadSettingsLayout({
        locals: locals(),
        url: url("/settings/planning"),
      } as never);
    } catch (error) {
      caught = error;
    }
    expect((caught as { status?: number }).status).toBe(403);
  });

  test("test_nav", () => {
    const personal = settingsGroups.find((group) => group.id === "personal");
    expect(personal).toBeDefined();
    const entry = personal?.sections.find(
      (section) => section.id === "availability",
    );
    expect(entry).toBeDefined();
    expect(entry?.href).toBe("/settings/availability");
    expect(entry?.label).toBe("Availability");
    expect(entry?.minRole).toBe("read");
  });
});

describe("availability load", () => {
  test("test_defaults", async () => {
    const data = _loadAvailability(USER.id);

    expect(data.hours).toEqual(DEFAULT_WORK_HOURS);
    expect(data.windows).toEqual([]);
    expect(data.feed).toBeNull();

    // The page load composes the same data.
    const page = await loadAvailabilityPage({
      locals: locals(),
      url: url("/settings/availability"),
    } as never);
    expect(page.hours).toEqual(DEFAULT_WORK_HOURS);
    expect(page.windows).toEqual([]);
    expect(page.feed).toBeNull();
  });

  test("falls back to the admin planning defaults", () => {
    const workDefaults = {
      timezone: "Europe/Berlin",
      start_minute: 480,
      end_minute: 960,
      work_days: [1, 2, 3, 4, 5, 6],
      buffer_percent: 25,
    };
    db.insert(stateSetting)
      .values({
        key: "planning.work_defaults",
        value: JSON.stringify(workDefaults),
        updatedAt: Date.now(),
      })
      .run();

    expect(_loadAvailability("never-saved").hours).toEqual(
      hoursFromDefaults(workDefaults),
    );
  });

  test("reads the viewer's hours, windows and feed hint", () => {
    const hours = {
      timezone: "Europe/Berlin",
      startMinute: 600,
      endMinute: 1080,
      workDays: [1, 2, 3, 4],
      bufferPercent: 30,
    };
    writeWorkHours(USER.id, hours);
    replaceWindows(USER.id, [
      {
        label: "Lunch",
        weekday: 1,
        date: null,
        startMinute: 720,
        endMinute: 780,
      },
      {
        label: "Dentist",
        weekday: null,
        date: "2026-11-03",
        startMinute: 600,
        endMinute: 660,
      },
    ]);
    rotateCalendarFeed(USER.id);

    const data = _loadAvailability(USER.id);

    expect(data.hours).toEqual(hours);
    expect(data.windows).toHaveLength(2);
    expect(data.windows.map((window) => window.label).sort()).toEqual([
      "Dentist",
      "Lunch",
    ]);
    expect(data.feed).not.toBeNull();
    expect(data.feed?.hint).toHaveLength(8);
    expect(data.feed?.createdAt).toEqual(expect.any(Number));
  });

  test("test_secret_once", () => {
    rotateCalendarFeed(USER.id);
    const data = _loadAvailability(USER.id);

    // A load only ever carries the non-secret hint, never a token or a URL.
    expect(data.feed).toEqual({
      hint: expect.any(String),
      createdAt: expect.any(Number),
    });
    expect(data.feed).not.toHaveProperty("token");
    expect(data.feed).not.toHaveProperty("url");

    const page = source(
      "src/routes/(app)/settings/availability/+page.svelte",
    );
    expect(page).not.toContain("data.feed");
    expect(page).not.toContain("feed.url");
    expect(page).toContain("calendar");
  });
});

describe("availability page contract", () => {
  test("test_posts_to_api", () => {
    const page = source(
      "src/routes/(app)/settings/availability/+page.svelte",
    );

    expect(page).toContain("/api/me/availability");
    expect(page.match(/\/api\/me\/calendar-feed/g)?.length).toBe(2);
    expect(page).toContain("'PUT'");
    expect(page).toContain("'POST'");
    expect(page).toContain("'DELETE'");
  });

  test("edits hours, weekdays and blocked windows", () => {
    const page = source(
      "src/routes/(app)/settings/availability/+page.svelte",
    );

    expect(page).toContain("from '#lib/time/zoned'");
    expect(page).toContain("formatClock(hours.startMinute)");
    expect(page).toContain("parseClock(startTime)");
    expect(page.match(/type="time"/g)?.length).toBe(4);
    expect(page).toContain("type=\"checkbox\"");
    for (const label of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      expect(page).toContain(label);
    }
    // Both window kinds are editable: recurring weekday or one-off date.
    expect(page).toContain("weekday");
    expect(page).toContain("date");
    expect(page).toContain("Add window");
    expect(page).toContain("max=\"90\"");
  });

  test("shows a copy action and feeds the URL from the POST response", () => {
    const page = source(
      "src/routes/(app)/settings/availability/+page.svelte",
    );

    expect(page).toContain("navigator.clipboard");
    expect(page).toContain("Copy");
    expect(page).toContain("Regenerate");
    expect(page).toContain("Revoke");
    // The absolute URL is assigned from the create/rotate response only.
    expect(page).toContain("created.url");
  });
});
