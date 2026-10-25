/**
 * The public tokenized ICS feed (SPEC §6).
 *
 * No session, no role guard: the URL itself is the capability. A missing,
 * unknown or rotated token is a plain 404 with no calendar body.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { localDateOf } from "#lib/time/zoned";
import type { WorkHours } from "#lib/planning/availability";
import { db } from "#lib/server/db/index";
import { authUser } from "#lib/server/db/schema";
import {
  replaceDayBlocks,
  replaceWindows,
  revokeCalendarFeed,
  rotateCalendarFeed,
  writeWorkHours,
} from "#lib/server/planning/day-store";
import { resetPlanning, seedPlanningIssue, seedPlanningRepo } from "#tests/planning-helpers";
import { GET } from "#/routes/api/calendar/[token]/+server";

const USER = "feed_user";
const UTC_USER = "feed_utc_user";

const HOURS: WorkHours = {
  timezone: "Europe/Berlin",
  startMinute: 540,
  endMinute: 1020,
  workDays: [1, 2, 3, 4, 5],
  bufferPercent: 20,
};

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

function call(token: string) {
  // Public route: no `locals.user` at all.
  return GET({ params: { token }, locals: {} } as never);
}

let token = "";
let today = "";

beforeEach(() => {
  seedUser();
  seedUser(UTC_USER);

  const repoId = seedPlanningRepo("orgA/core");
  seedPlanningIssue({ repoId, number: 12, title: "Write the feed" });

  writeWorkHours(USER, HOURS);
  today = localDateOf(Date.now(), HOURS.timezone);
  replaceDayBlocks(USER, today, [
    {
      startMinute: 540,
      minutes: 60,
      kind: "issue",
      org: "orgA",
      name: "core",
      issueNumber: 12,
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
  replaceWindows(USER, [
    {
      label: "School run",
      weekday: null,
      date: today,
      startMinute: 420,
      endMinute: 480,
    },
  ]);
  token = rotateCalendarFeed(USER).token;
});

afterEach(() => {
  revokeCalendarFeed(USER);
  revokeCalendarFeed(UTC_USER);
  db.delete(authUser).where(eq(authUser.id, USER)).run();
  db.delete(authUser).where(eq(authUser.id, UTC_USER)).run();
  resetPlanning();
});

describe("GET /api/calendar/[token]", () => {
  test("test_route", async () => {
    const res = await call(token);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe(
      'inline; filename="funnel.ics"',
    );
    expect(res.headers.get("cache-control")).toBe("private, max-age=300");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");

    const body = await res.text();
    expect(body.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(body.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(body).toContain("BEGIN:VEVENT\r\n");
    expect(body).toContain("SUMMARY:FUNNEL-12 Write the feed\r\n");
    expect(body).toContain("SUMMARY:Buffer\r\n");
    expect(body).toContain("SUMMARY:School run\r\n");
    expect(body).toContain("TRANSP:OPAQUE\r\n");
    expect(body).toContain("UID:state_day_block-");
    expect(body).toContain("DTSTAMP:");
  });

  test("test_ics_suffix", async () => {
    const plain = await call(token);
    const suffixed = await call(`${token}.ics`);

    expect(plain.status).toBe(200);
    expect(suffixed.status).toBe(200);
    expect(await suffixed.text()).toContain("BEGIN:VEVENT");
  });

  test("unknown token is 404", async () => {
    const res = await call("not-a-real-token");
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("BEGIN:VCALENDAR");
  });

  test("rotated token is 404", async () => {
    const previous = token;
    token = rotateCalendarFeed(USER).token;

    expect((await call(previous)).status).toBe(404);
    expect((await call(token)).status).toBe(200);
  });

  test("no stored hours falls back to UTC", async () => {
    const utcToken = rotateCalendarFeed(UTC_USER).token;
    replaceDayBlocks(UTC_USER, localDateOf(Date.now(), "UTC"), [
      {
        startMinute: 540,
        minutes: 60,
        kind: "issue",
        org: "orgA",
        name: "core",
        issueNumber: 12,
      },
    ]);

    const res = await call(utcToken);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("SUMMARY:FUNNEL-12 Write the feed");
  });
});
