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
  labels: { prefix: "" },
  intake: { default_repo: "orgA/core" },
  sync: {
    history_days: 45,
    poll_interval_active_seconds: 15,
    poll_interval_idle_seconds: 90,
  },
  board: { done_days: 7, wip_limits: { "in-progress": 2 } },
  session: { idle_days: 21 },
  notifications: { enabled: true, native: true, new_intake: true },
  planning: {
    size_minutes: { sm: 60, md: 180, lg: 420 },
    allocation_percent: 50,
    cycle_weeks: 3,
    cycle_anchor: "2025-01-06",
    maintainers: [
      {
        forge: "github",
        instance: "github.com",
        external_id: "7",
        login: "ann",
        avatar_url: "https://avatars.example/ann.png",
        weekly_minutes: 1800,
        active: true,
      },
    ],
  },
};

afterEach(() => {
  clearSettings();
});

describe("settings store", () => {
  test("returns defaults when the table is empty", () => {
    const settings = readSettings();

    expect(settings.repos).toEqual([]);
    expect(settings.projects).toEqual([]);
    expect(settings.labels).toEqual({ prefix: "" });
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

  test("test_planning_defaults", () => {
    expect(readSettings().planning).toEqual({
      size_minutes: { sm: 120, md: 240, lg: 480 },
      allocation_percent: 60,
      cycle_weeks: 2,
      cycle_anchor: "2024-01-01",
      maintainers: [],
    });
  });

  test("test_monday_anchor_rejected", () => {
    expect(() =>
      writeSettings({
        ...BASE,
        planning: { ...BASE.planning, cycle_anchor: "2024-01-02" },
      })
    ).toThrow(SettingsError);
  });

  test("test_allocation_bounds", () => {
    // Both inclusive boundaries are valid and persist unchanged.
    for (const allocation_percent of [1, 100]) {
      writeSettings({
        ...BASE,
        planning: { ...BASE.planning, allocation_percent },
      });
      expect(readSettings().planning.allocation_percent).toBe(allocation_percent);
    }
    for (const allocation_percent of [0, 101, 60.5]) {
      expect(() =>
        writeSettings({
          ...BASE,
          planning: { ...BASE.planning, allocation_percent },
        })
      ).toThrow(SettingsError);
    }
  });

  test("test_cycle_weeks_bounds", () => {
    // Both inclusive boundaries are valid and persist unchanged.
    for (const cycle_weeks of [1, 52]) {
      writeSettings({ ...BASE, planning: { ...BASE.planning, cycle_weeks } });
      expect(readSettings().planning.cycle_weeks).toBe(cycle_weeks);
    }
    for (const cycle_weeks of [0, 53, 1.5]) {
      expect(() =>
        writeSettings({ ...BASE, planning: { ...BASE.planning, cycle_weeks } })
      ).toThrow(SettingsError);
    }
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

  test("defaults the label prefix to empty", () => {
    expect(readSettings().labels).toEqual({ prefix: "" });
  });

  test("round-trips a label prefix", () => {
    writeSettings({ ...BASE, labels: { prefix: "funnel" } });

    expect(readSettings().labels).toEqual({ prefix: "funnel" });
  });

  test("normalizes a trailing hyphen on write", () => {
    writeSettings({ ...BASE, labels: { prefix: "  funnel- " } });

    expect(readSettings().labels.prefix).toBe("funnel");
  });

  test("rejects unsafe or over-long label prefixes", () => {
    for (const prefix of ["funnel_2", "funnel 2", "funnel/2", "x".repeat(33)]) {
      expect(() =>
        writeSettings({ ...BASE, labels: { prefix } })
      ).toThrow(SettingsError);
    }
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
