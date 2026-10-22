import { afterEach, describe, expect, test } from "bun:test";
import { getConfig, resetConfigCache } from "#lib/server/config";
import { applySettings, saveSettings } from "./apply";
import {
  clearSettings,
  readSettings,
  writeSettings,
  type SettingsInput,
} from "./store";

const BASE: SettingsInput = {
  repos: ["orgA/core"],
  projects: ["project1"],
  intake: { default_repo: "orgA/core" },
  sync: {
    history_days: 45,
    poll_interval_active_seconds: 15,
    poll_interval_idle_seconds: 90,
  },
  board: { done_days: 7, wip_limits: {} },
  session: { idle_days: 21 },
  notifications: { enabled: true, native: true, new_intake: true },
};

afterEach(() => {
  clearSettings();
  resetConfigCache();
});

describe("applySettings", () => {
  test("merges a patch and preserves the other sections", () => {
    writeSettings(BASE);

    applySettings({ board: { done_days: 3, wip_limits: { todo: 2 } } });

    const settings = readSettings();
    expect(settings.board).toEqual({ done_days: 3, wip_limits: { todo: 2 } });
    expect(settings.sync).toEqual(BASE.sync);
    // A save re-validates the merged config, so repos are stored normalized.
    expect(settings.repos).toEqual([{ repo: "orgA/core", shortcode: "CORE" }]);
  });

  test("invalidates the cached config after a save", async () => {
    writeSettings(BASE);
    resetConfigCache();

    const before = await getConfig();
    applySettings({ session: { idle_days: 7 } });
    const after = await getConfig();

    expect(before.session.idle_days).toBe(21);
    expect(after.session.idle_days).toBe(7);
  });
});

describe("saveSettings", () => {
  test("rejects a patch that breaks a cross-field rule", () => {
    writeSettings(BASE);

    // `intake.default_repo` still points at orgA/core, which the patch removes.
    const result = saveSettings({ repos: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/default_repo/);
    // The store is left untouched.
    expect(readSettings().repos).toEqual(BASE.repos);
  });

  test("rejects an invalid value", () => {
    writeSettings(BASE);

    const result = saveSettings({ sync: { history_days: -1 } });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.length).toBeGreaterThan(0);
  });

  test("applies a valid patch", () => {
    writeSettings(BASE);

    const result = saveSettings({ intake: { default_repo: undefined } });

    expect(result).toEqual({ ok: true });
    expect(readSettings().intake).toEqual({});
  });
});
