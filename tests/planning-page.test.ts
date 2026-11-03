/**
 * `/settings/planning` and `/plan` route loads, plus the static navigation and
 * copy the planner depends on (SPEC §5, §6).
 *
 * The loads are exercised with the same `locals`/`url` shape SvelteKit passes,
 * against the shared in-memory DB. Settings are reset per case so the planning
 * defaults are deterministic.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { cycleForWeek } from "#lib/server/planning/calendar";
import { getConfig, resetConfigCache } from "#lib/server/config";
import { saveSettings } from "#lib/server/settings/apply";
import {
  clearSettings,
  DEFAULT_WORK_DEFAULTS,
} from "#lib/server/settings/store";
import type { Role } from "#lib/roles";
import * as planRoute from "#/routes/(app)/plan/+page.server";
import { load as loadSettingsLayout } from "#/routes/(app)/settings/+layout.server";
import {
  actions as planningActions,
  load as loadPlanningSettings,
} from "#/routes/(app)/settings/planning/+page.server";
import { resetPlanning } from "#tests/planning-helpers";

const { load: loadPlan } = planRoute;

const HINT =
  "Enter net hours: contracted weekly hours minus recurring meetings, on-call, and other fixed commitments. Funnel plans at most 60% of this; the rest is buffer.";

const USER = {
  id: "planning-page-user",
  name: "Planning Page",
  email: "planning@example.com",
  image: null,
  role: "admin" as Role,
};

/** The full shape `requireUser` projects for a page load. */
function locals(user: typeof USER | null = USER) {
  return { user, session: null };
}

function url(path: string): URL {
  return new URL(`http://x${path}`);
}

/** A `save` action request carrying one settings payload. */
function payloadForm(payload: unknown): Request {
  const body = new FormData();
  body.set("payload", JSON.stringify(payload));
  return new Request("http://x/settings/planning?/save", {
    method: "POST",
    body,
  });
}

/** The page's own planning slice: decimal hours already converted to minutes. */
const PLANNING_PAYLOAD = {
  planning: {
    size_minutes: { sm: 90, md: 240, lg: 480 },
    allocation_percent: 55,
    cycle_weeks: 3,
    cycle_anchor: "2024-01-01",
    work_defaults: {
      timezone: "Europe/Berlin",
      start_minute: 480,
      end_minute: 960,
      work_days: [1, 2, 3, 4, 5, 6],
      buffer_percent: 25,
    },
    maintainers: [
      {
        forge: "github",
        instance: "github.com",
        external_id: "7",
        login: "ann",
        avatar_url: null,
        weekly_minutes: 450,
        active: true,
      },
    ],
  },
};

function source(relative: string): string {
  return readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");
}

/** The Monday of the week containing `now`, in UTC (`YYYY-MM-DD`). */
function currentMonday(): string {
  const date = new Date();
  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const offset = (utc.getUTCDay() + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - offset);
  return utc.toISOString().slice(0, 10);
}

beforeEach(() => {
  resetPlanning();
  clearSettings();
  resetConfigCache();
});

afterEach(() => {
  resetPlanning();
  clearSettings();
  resetConfigCache();
});

describe("planning settings load", () => {
  test("test_planning_defaults_load", async () => {
    const data = await loadPlanningSettings({
      locals: locals(),
      url: url("/settings/planning"),
    } as never);

    expect(data.planning.allocation_percent).toBe(60);
    expect(data.planning.maintainers).toEqual([]);
    expect(data.planning.size_minutes).toEqual({ sm: 120, md: 240, lg: 480 });
    expect(data.planning.work_defaults).toEqual(DEFAULT_WORK_DEFAULTS);
    expect(data.candidates).toEqual([]);
  });

  test("test_settings_requires_admin", async () => {
    let caught: unknown;
    try {
      await loadSettingsLayout({
        locals: locals({ ...USER, role: "write" }),
        url: url("/settings/planning"),
      } as never);
    } catch (error) {
      caught = error;
    }

    expect((caught as { status?: number }).status).toBe(403);
  });

  test("test_planning_save_preserves_other_slices", async () => {
    const seeded = saveSettings({ board: { done_days: 30, wip_limits: {} } });
    expect(seeded.ok).toBe(true);

    const result = await planningActions.save({
      request: payloadForm(PLANNING_PAYLOAD),
      locals: locals(),
    } as never);
    expect(result).toEqual({ saved: true });

    resetConfigCache();
    const config = await getConfig();
    expect(config.board.done_days).toBe(30);
    expect(config.planning.size_minutes.sm).toBe(90);
    expect(config.planning.allocation_percent).toBe(55);
    expect(config.planning.work_defaults).toEqual(
      PLANNING_PAYLOAD.planning.work_defaults,
    );
    expect(config.planning.maintainers[0]?.weekly_minutes).toBe(450);
  });
});

describe("plan load", () => {
  test("test_default_horizon_is_current_week", async () => {
    const data = await loadPlan({
      locals: locals(),
      url: url("/plan"),
    } as never);

    const monday = currentMonday();
    expect(data.horizon).toBe("week");
    expect(data.week).toBe(monday);
    expect(data.weekPlan.weekStart).toBe(monday);
    expect(data.allocationPercent).toBe(60);
  });

  test("test_cycle_horizon", async () => {
    const data = await loadPlan({
      locals: locals(),
      url: url("/plan?horizon=cycle&cycle=2026-10-19"),
    } as never);

    expect(data.horizon).toBe("cycle");
    expect(data.cycle).toBe("2026-10-19");
    expect(data.cyclePlan.key).toBe("2026-10-19");
    expect(data.cyclePlan.start).toBe("2026-10-19");
  });

  test("test_requires_user", async () => {
    let caught: unknown;
    try {
      await loadPlan({
        locals: locals(null),
        url: url("/plan?horizon=week"),
      } as never);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    expect((caught as { status?: number }).status).toBe(303);
    expect((caught as { location?: string }).location).toContain("/login");
  });

  test("test_plan_route_is_read_only", () => {
    expect("actions" in planRoute).toBe(false);
  });

  test("test_invalid_query_falls_back_to_current_week", async () => {
    const data = await loadPlan({
      locals: locals(),
      url: url("/plan?horizon=bogus&week=2026-02-30&cycle=2026-10-20"),
    } as never);

    const monday = currentMonday();
    expect(data.horizon).toBe("week");
    expect(data.week).toBe(monday);
    expect(data.weekPlan.weekStart).toBe(monday);
    expect(data.cycle).toBe(cycleForWeek(monday, "2024-01-01", 2).key);
  });

  test("test_week_navigation", async () => {
    const data = await loadPlan({
      locals: locals(),
      url: url("/plan?week=2026-10-19"),
    } as never);

    expect(data.previous).toBe("2026-10-12");
    expect(data.next).toBe("2026-10-26");
  });

  test("test_cycle_navigation", async () => {
    const data = await loadPlan({
      locals: locals(),
      url: url("/plan?horizon=cycle&cycle=2026-10-19"),
    } as never);

    expect(data.previous).toBe("2026-10-05");
    expect(data.next).toBe("2026-11-02");
  });

  test("test_milestone_horizon_has_no_navigation", async () => {
    const data = await loadPlan({
      locals: locals(),
      url: url("/plan?horizon=milestone"),
    } as never);

    expect(data.previous).toBeNull();
    expect(data.next).toBeNull();
  });
});

describe("planning navigation and copy", () => {
  test("test_navbar_has_plan", () => {
    const navigation = source("src/lib/components/shell/navigation.ts");
    expect(navigation).toMatch(/href:\s*['"]\/plan['"]/);
    expect(navigation).toMatch(/label:\s*['"]Plan['"]/);
  });

  test("test_navbar_plan_active_state", () => {
    const navigation = source("src/lib/components/shell/navigation.ts");
    expect(navigation).toMatch(/match:\s*['"]\/plan['"]/);
  });

  test("test_settings_nav_has_planning", () => {
    expect(source("src/lib/components/settings/sections.ts")).toContain(
      "/settings/planning",
    );
  });

  test("test_net_hours_hint", () => {
    const page = source("src/routes/(app)/settings/planning/+page.svelte");
    expect(page).toContain(HINT);
    expect(page.toLowerCase()).not.toContain("gross hours");
  });

  test("test_hours_minutes_conversion_direction", () => {
    const page = source("src/routes/(app)/settings/planning/+page.svelte");
    // Stored minutes are shown as decimal hours…
    expect(page).toContain("minutesToHours(planning.size_minutes.sm)");
    expect(page).toContain("minutesToHours(maintainer.weekly_minutes)");
    // …and the posted payload converts the edited hours back to minutes.
    expect(page).toContain("hoursToMinutes(sizeSm ?? 0)");
    expect(page).toContain("hoursToMinutes(row.hours ?? 0)");
  });

  test("test_work_defaults_inputs", () => {
    const page = source("src/routes/(app)/settings/planning/+page.svelte");

    // The admin card uses the shared clock helpers for its two time fields.
    expect(page).toContain("from '#lib/time/zoned'");
    expect(page).toContain("formatClock(workDefaults.start_minute)");
    expect(page).toContain("parseClock(startTime)");
    expect(page.match(/type="time"/g)?.length).toBe(2);
    expect(page).toContain("bind:value={timezone}");
    expect(page).toContain("WORKDAYS");
    for (const label of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      expect(page).toContain(label);
    }
    // The buffer field is bounded to the spec's 0..90 percent.
    expect(page).toContain('max="90"');
    expect(page).toContain("min=\"0\"");
  });

  test("test_work_defaults_form_payload", () => {
    const page = source("src/routes/(app)/settings/planning/+page.svelte");

    expect(page).toContain("work_defaults:");
    expect(page).toContain("start_minute: parseClock(startTime)");
    expect(page).toContain("end_minute: parseClock(endTime)");
    expect(page).toContain("work_days:");
    expect(page).toContain("buffer_percent:");
  });
});
