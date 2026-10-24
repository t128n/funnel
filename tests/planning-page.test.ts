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
import { resetConfigCache } from "#lib/server/config";
import { clearSettings } from "#lib/server/settings/store";
import { load as loadPlan } from "#/routes/(app)/plan/+page.server";
import { load as loadPlanningSettings } from "#/routes/(app)/settings/planning/+page.server";
import { resetPlanning } from "#tests/planning-helpers";

const HINT =
  "Enter net hours: contracted weekly hours minus recurring meetings, on-call, and other fixed commitments. Funnel plans at most 60% of this; the rest is buffer.";

const USER = {
  id: "planning-page-user",
  name: "Planning Page",
  email: "planning@example.com",
  image: null,
  role: "admin" as const,
};

/** The full shape `requireUser` projects for a page load. */
function locals(user: typeof USER | null = USER) {
  return { user, session: null };
}

function url(path: string): URL {
  return new URL(`http://x${path}`);
}

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
    expect(data.candidates).toEqual([]);
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
});

describe("planning navigation and copy", () => {
  test("test_sidebar_has_plan", () => {
    expect(source("src/lib/components/app-sidebar.svelte")).toContain("/plan");
  });

  test("test_settings_nav_has_planning", () => {
    expect(source("src/lib/components/settings/sections.ts")).toContain(
      "/settings/planning",
    );
  });

  test("test_net_hours_hint", () => {
    expect(
      source("src/routes/(app)/settings/planning/+page.svelte"),
    ).toContain(HINT);
  });
});
