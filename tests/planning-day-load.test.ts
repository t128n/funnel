/**
 * `/plan?horizon=day` — the day view on top of the existing week/cycle/
 * milestone payload (SPEC §7).
 *
 * The load is exercised with the same `locals`/`url` shape SvelteKit passes,
 * against the shared in-memory DB. Hours, windows, blocks, actuals and the feed
 * token are seeded through the durable `state_*` modules so each case checks
 * the composed view, not a mock.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { clearSettings } from "#lib/server/settings/store";
import { resetConfigCache } from "#lib/server/config";
import { cycleForWeek } from "#lib/server/planning/calendar";
import {
  replaceDayBlocks,
  rotateCalendarFeed,
  writeWorkHours,
} from "#lib/server/planning/day-store";
import { localDateOf } from "#lib/time/zoned";
import type { Role } from "#lib/roles";
import { dayView, load as loadPlan } from "#/routes/(app)/plan/+page.server";
import {
  removePlanningAuthUser,
  resetPlanning,
  seedPlanningAuthUser,
  seedPlanningEvent,
} from "#tests/planning-helpers";

const USER = "day-load-user";
const SUNDAY = "2026-10-25";
const WEDNESDAY = "2026-10-21";

function locals(role: Role = "read", id = USER) {
  return {
    user: {
      id,
      name: "Day Load",
      email: `${id}@example.com`,
      image: null,
      role,
    },
    session: null,
  };
}

function url(path: string): URL {
  return new URL(`http://x${path}`);
}

function issueBlock(startMinute: number, minutes: number, issueNumber: number) {
  return {
    startMinute,
    minutes,
    kind: "issue" as const,
    org: "orgA",
    name: "core",
    issueNumber,
  };
}

function bufferBlock(startMinute: number, minutes: number) {
  return {
    startMinute,
    minutes,
    kind: "buffer" as const,
    org: null,
    name: null,
    issueNumber: null,
  };
}

beforeEach(() => {
  resetPlanning();
  clearSettings();
  resetConfigCache();
  seedPlanningAuthUser(USER);
});

afterEach(() => {
  removePlanningAuthUser(USER);
  resetPlanning();
  clearSettings();
  resetConfigCache();
});

describe("day horizon", () => {
  test("test_day_param", async () => {
    const data = await loadPlan({
      locals: locals(),
      url: url(`/plan?horizon=day&day=${SUNDAY}`),
    } as never);

    expect(data.horizon).toBe("day");
    expect(data.dayView.date).toBe(SUNDAY);
    expect(data.previous).toBe("2026-10-24");
    expect(data.next).toBe("2026-10-26");
  });

  test("test_bad_day_falls_back_to_viewer_today", async () => {
    const data = await loadPlan({
      locals: locals(),
      url: url("/plan?horizon=day&day=2026-02-30"),
    } as never);

    expect(data.horizon).toBe("day");
    expect(data.dayView.date).toBe(localDateOf(Date.now(), "UTC"));
  });

  test("test_totals", async () => {
    replaceDayBlocks(USER, WEDNESDAY, [
      issueBlock(540, 120, 1),
      issueBlock(660, 60, 2),
      bufferBlock(720, 90),
    ]);

    const view = await dayView(USER, WEDNESDAY);

    expect(view.plannedMinutes).toBe(180);
    expect(view.bufferPlannedMinutes).toBe(90);
  });

  test("test_actuals_clipped", async () => {
    replaceDayBlocks(USER, "2026-10-23", [issueBlock(540, 120, 7)]);
    seedPlanningEvent({
      org: "orgA",
      name: "core",
      issueNumber: 7,
      kind: "status",
      toValue: "in-progress",
      at: Date.UTC(2026, 9, 22, 22),
    });
    seedPlanningEvent({
      org: "orgA",
      name: "core",
      issueNumber: 7,
      kind: "state",
      toValue: "closed",
      at: Date.UTC(2026, 9, 23, 2),
    });

    const view = await dayView(USER, "2026-10-23");

    expect(view.review.rows).toHaveLength(1);
    expect(view.review.rows[0]?.actualMinutes).toBe(120);
    expect(view.review.rows[0]?.varianceMinutes).toBe(0);
  });

  test("test_sunday", async () => {
    const view = await dayView(USER, SUNDAY);

    expect(view.weekday).toBe(7);
    expect(view.available).toEqual([]);
    expect(view.availableMinutes).toBe(0);
    expect(view.bufferMinutes).toBe(0);
  });

  test("test_feed_flag", async () => {
    expect((await dayView(USER, WEDNESDAY)).feedEnabled).toBe(false);

    rotateCalendarFeed(USER);

    expect((await dayView(USER, WEDNESDAY)).feedEnabled).toBe(true);
  });

  test("test_stored_hours_are_effective", async () => {
    writeWorkHours(USER, {
      timezone: "Europe/Berlin",
      startMinute: 480,
      endMinute: 960,
      workDays: [1, 2, 3, 4, 5, 6],
      bufferPercent: 25,
    });

    const view = await dayView(USER, "2026-10-24");

    expect(view.workHours.timezone).toBe("Europe/Berlin");
    expect(view.startMinute).toBe(480);
    expect(view.availableMinutes).toBe(480);
    expect(view.bufferMinutes).toBe(120);
  });
});

describe("week payload", () => {
  test("test_week_payload_unchanged", async () => {
    const data = await loadPlan({
      locals: locals("admin"),
      url: url("/plan?week=2026-10-19"),
    } as never);

    expect(data.horizon).toBe("week");
    expect(data.week).toBe("2026-10-19");
    expect(data.weekPlan.weekStart).toBe("2026-10-19");
    expect(data.cycle).toBe(cycleForWeek("2026-10-19", "2024-01-01", 2).key);
    expect(data.cyclePlan).toBeDefined();
    expect(data.milestones).toBeDefined();
    expect(data.candidates).toEqual([]);
    expect(data.maintainers).toEqual([]);
    expect(data.allocationPercent).toBe(60);
    expect(data.previous).toBe("2026-10-12");
    expect(data.next).toBe("2026-10-26");
  });
});
