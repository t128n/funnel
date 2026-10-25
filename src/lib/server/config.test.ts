import { afterEach, describe, expect, test } from "bun:test";
import {
  ConfigError,
  getConfig,
  loadFunnelConfig,
  resetConfigCache,
} from "./config";
import {
  clearSettings,
  SettingsError,
  writeSettings,
  type SettingsInput,
} from "./settings/store";

/** A complete, all-defaults payload; `seed` overrides individual sections. */
const BASE: SettingsInput = {
  repos: [],
  projects: [],
  intake: {},
  sync: {
    history_days: 90,
    poll_interval_active_seconds: 30,
    poll_interval_idle_seconds: 300,
  },
  board: { done_days: 14, wip_limits: {} },
  session: { idle_days: 30 },
  notifications: { enabled: true, native: true, new_intake: true },
  planning: {
    size_minutes: { sm: 120, md: 240, lg: 480 },
    allocation_percent: 60,
    cycle_weeks: 2,
    cycle_anchor: "2024-01-01",
    work_defaults: {
      timezone: "UTC",
      start_minute: 540,
      end_minute: 1020,
      work_days: [1, 2, 3, 4, 5],
      buffer_percent: 20,
    },
    maintainers: [],
  },
};

/** Write settings to the in-memory `state_setting` table. */
function seed(partial: Partial<SettingsInput>): void {
  writeSettings({ ...BASE, ...partial });
}

afterEach(() => {
  clearSettings();
  resetConfigCache();
});

describe("loadFunnelConfig", () => {
  test("loads settings, normalizes lists, and uses the env host", async () => {
    seed({
      repos: ["orgA/core", "orgA/web", "orgA/core"],
      projects: [{ label: "project1", name: "Project One" }, "project2"],
      intake: { default_repo: "orgA/core" },
      sync: {
        history_days: 30,
        poll_interval_active_seconds: 10,
        poll_interval_idle_seconds: 120,
      },
      board: { done_days: 7, wip_limits: { "in-progress": 3 } },
      session: { idle_days: 1 },
    });

    const config = await loadFunnelConfig();

    expect(config).toEqual({
      github: {
        url: "https://github.com",
        api_url: "https://api.github.com",
      },
      repos: [
        { repo: "orgA/core", shortcode: "CORE" },
        { repo: "orgA/web", shortcode: "WEB" },
      ],
      projects: [
        { label: "project1", name: "Project One" },
        { label: "project2", name: "project2" },
      ],
      intake: { default_repo: "orgA/core" },
      sync: {
        history_days: 30,
        poll_interval_active_seconds: 10,
        poll_interval_idle_seconds: 120,
      },
      board: { done_days: 7, wip_limits: { "in-progress": 3 } },
      session: { idle_days: 1 },
      notifications: { enabled: true, native: true, new_intake: true },
      planning: {
        size_minutes: { sm: 120, md: 240, lg: 480 },
        allocation_percent: 60,
        cycle_weeks: 2,
        cycle_anchor: "2024-01-01",
        work_defaults: {
          timezone: "UTC",
          start_minute: 540,
          end_minute: 1020,
          work_days: [1, 2, 3, 4, 5],
          buffer_percent: 20,
        },
        maintainers: [],
      },
    });
  });

  test("fills omitted settings from defaults", async () => {
    seed({});

    const config = await loadFunnelConfig();

    expect(config.github).toEqual({
      url: "https://github.com",
      api_url: "https://api.github.com",
    });
    expect(config.sync).toEqual({
      history_days: 90,
      poll_interval_active_seconds: 30,
      poll_interval_idle_seconds: 300,
    });
    expect(config.board).toEqual({ done_days: 14, wip_limits: {} });
    expect(config.session).toEqual({ idle_days: 30 });
    expect(config.notifications).toEqual({
      enabled: true,
      native: true,
      new_intake: true,
    });
    expect(config.intake).toEqual({});
  });

  test("test_planning_defaults_from_empty_store", async () => {
    // No rows at all: the planning section must compose from per-key defaults.
    const config = await loadFunnelConfig();

    expect(config.planning).toEqual({
      size_minutes: { sm: 120, md: 240, lg: 480 },
      allocation_percent: 60,
      cycle_weeks: 2,
      cycle_anchor: "2024-01-01",
      work_defaults: {
        timezone: "UTC",
        start_minute: 540,
        end_minute: 1020,
        work_days: [1, 2, 3, 4, 5],
        buffer_percent: 20,
      },
      maintainers: [],
    });
  });

  test("test_duplicate_maintainer_rejected", async () => {
    const maintainer = (login: string) => ({
      forge: "github",
      instance: "github.com",
      external_id: "7",
      login,
      weekly_minutes: 600,
      active: true,
    });
    seed({
      planning: {
        ...BASE.planning,
        maintainers: [maintainer("ann"), maintainer("bob")],
      },
    });

    await expect(loadFunnelConfig()).rejects.toThrow(/unique|maintainer/i);
  });

  test("test_planning_loads_with_roster", async () => {
    seed({
      planning: {
        size_minutes: { sm: 60, md: 180, lg: 420 },
        allocation_percent: 75,
        cycle_weeks: 4,
        cycle_anchor: "2025-01-06",
        work_defaults: {
          timezone: "Europe/Berlin",
          start_minute: 480,
          end_minute: 960,
          work_days: [1, 2, 3, 4, 5],
          buffer_percent: 30,
        },
        maintainers: [
          {
            forge: "github",
            instance: "github.com",
            external_id: "7",
            login: "ann",
            weekly_minutes: 1800,
            active: true,
          },
        ],
      },
    });

    const config = await loadFunnelConfig();

    expect(config.planning.allocation_percent).toBe(75);
    expect(config.planning.cycle_anchor).toBe("2025-01-06");
    expect(config.planning.work_defaults).toEqual({
      timezone: "Europe/Berlin",
      start_minute: 480,
      end_minute: 960,
      work_days: [1, 2, 3, 4, 5],
      buffer_percent: 30,
    });
    expect(config.planning.maintainers).toHaveLength(1);
  });

  test("allows a fresh install with no repositories", async () => {
    seed({});

    const config = await loadFunnelConfig();

    expect(config.repos).toEqual([]);
  });

  test("normalizes structured repos and honours an explicit shortcode", async () => {
    seed({
      repos: [{ repo: "t128n/funnel-issue-tracker", shortcode: "fit" }, "orgB/infra"],
    });

    const config = await loadFunnelConfig();

    expect(config.repos).toEqual([
      { repo: "t128n/funnel-issue-tracker", shortcode: "FIT" },
      { repo: "orgB/infra", shortcode: "INFRA" },
    ]);
  });

  test("rejects duplicate shortcodes", async () => {
    seed({
      repos: [
        { repo: "orgA/core", shortcode: "CORE" },
        { repo: "orgB/core", shortcode: "CORE" },
      ],
    });

    await expect(loadFunnelConfig()).rejects.toThrow(/shortcode/i);
  });

  test("rejects a malformed repository identifier on write", () => {
    expect(() => seed({ repos: ["not-a-repo"] })).toThrow(SettingsError);
  });

  test("rejects intake.default_repo that is not configured", async () => {
    seed({ repos: ["orgA/core"], intake: { default_repo: "orgB/other" } });

    await expect(loadFunnelConfig()).rejects.toThrow(/default_repo/);
  });

  test("defaults projects to an empty list", async () => {
    seed({ repos: ["orgA/core"] });

    expect((await loadFunnelConfig()).projects).toEqual([]);
  });

  test("normalizes structured projects and defaults name to the label", async () => {
    seed({
      repos: ["orgA/core"],
      projects: [
        { label: "project1", name: "Project One" },
        { label: "project2" },
      ],
    });

    const config = await loadFunnelConfig();

    expect(config.projects).toEqual([
      { label: "project1", name: "Project One" },
      { label: "project2", name: "project2" },
    ]);
  });

  test("accepts bare label strings and de-duplicates case-insensitively", async () => {
    seed({
      repos: ["orgA/core"],
      projects: ["Project1", "project1", "project2"],
    });

    const config = await loadFunnelConfig();

    expect(config.projects).toEqual([
      { label: "Project1", name: "Project1" },
      { label: "project2", name: "project2" },
    ]);
  });

  test("rejects an empty project label on write", () => {
    expect(() => seed({ projects: [{ label: "" }] })).toThrow(SettingsError);
  });
});

describe("getConfig", () => {
  test("caches one load until reset", async () => {
    seed({ repos: ["orgA/core"] });
    resetConfigCache();

    const first = getConfig();
    const second = getConfig();
    expect(second).toBe(first);
    await first;

    resetConfigCache();
    const third = getConfig();
    expect(third).not.toBe(first);
    await third;
  });

  test("does not cache a failed load", async () => {
    seed({ repos: ["orgA/core"], intake: { default_repo: "orgB/other" } });
    resetConfigCache();

    await expect(getConfig()).rejects.toBeInstanceOf(ConfigError);

    // A corrected write must take effect without an explicit cache reset.
    seed({ repos: ["orgA/core"], intake: {} });
    await expect(getConfig()).resolves.toBeDefined();
  });
});
