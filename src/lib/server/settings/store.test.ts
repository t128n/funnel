import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import { stateSetting } from "#lib/server/db/schema";
import {
  clearSettings,
  readSettings,
  SettingsError,
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
  board: { done_days: 7, wip_limits: { "in-progress": 2 } },
  session: { idle_days: 21 },
  notifications: { enabled: true, native: true, new_intake: true },
};

afterEach(() => {
  clearSettings();
});

describe("settings store", () => {
  test("returns defaults when the table is empty", () => {
    const settings = readSettings();

    expect(settings.repos).toEqual([]);
    expect(settings.projects).toEqual([]);
    expect(settings.intake).toEqual({});
    expect(settings.sync).toEqual({
      history_days: 90,
      poll_interval_active_seconds: 30,
      poll_interval_idle_seconds: 300,
    });
    expect(settings.board).toEqual({ done_days: 14, wip_limits: {} });
    expect(settings.session).toEqual({ idle_days: 30 });
    expect(settings.notifications).toEqual({ enabled: true, native: true, new_intake: true });
  });

  test("test_notifications_default_true", () => {
    expect(readSettings().notifications).toEqual({ enabled: true, native: true, new_intake: true });
  });

  test("test_notifications_round_trip", () => {
    writeSettings({
      ...BASE,
      notifications: { enabled: false, native: true, new_intake: false },
    });

    expect(readSettings().notifications).toEqual({
      enabled: false,
      native: true,
      new_intake: false,
    });
  });

  test("test_invalid_notification_value_rejected", () => {
    expect(() =>
      writeSettings({
        ...BASE,
        notifications: { ...BASE.notifications, native: "yes" as unknown as boolean },
      })
    ).toThrow(SettingsError);
  });

  test("round-trips a full payload", () => {
    writeSettings(BASE);

    expect(readSettings()).toEqual(BASE);
  });

  test("deletes the row for an unset intake.default_repo", () => {
    writeSettings(BASE);
    writeSettings({ ...BASE, intake: {} });

    expect(readSettings().intake).toEqual({});
    const rows = db.select().from(stateSetting).all();
    expect(rows.some((row) => row.key === "intake.default_repo")).toBe(false);
  });

  test("degrades a corrupt row to the default", () => {
    writeSettings(BASE);
    db.update(stateSetting)
      .set({ value: "not json" })
      .where(eq(stateSetting.key, "sync.history_days"))
      .run();

    expect(readSettings().sync.history_days).toBe(90);
  });

  test("rejects an invalid value", () => {
    expect(() => writeSettings({ ...BASE, sync: { ...BASE.sync, history_days: -1 } })).toThrow(
      SettingsError
    );
  });
});
