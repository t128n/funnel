import { afterEach, describe, expect, test } from "bun:test";
import {
  ConfigError,
  DEFAULT_CONFIG,
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
    });
  });

  test("fills omitted settings from defaults", async () => {
    seed({});

    const config = await loadFunnelConfig();

    expect(config.github).toEqual(DEFAULT_CONFIG.github);
    expect(config.sync).toEqual(DEFAULT_CONFIG.sync);
    expect(config.board).toEqual(DEFAULT_CONFIG.board);
    expect(config.session).toEqual(DEFAULT_CONFIG.session);
    expect(config.notifications).toEqual(DEFAULT_CONFIG.notifications);
    expect(config.intake).toEqual({});
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
