import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { db } from "#lib/server/db/index";
import {
  stateIntakeSubmission,
  stateTriageEvent,
} from "#lib/server/db/schema";
import {
  clearSettings,
  writeSettings,
  type SettingsInput,
} from "#lib/server/settings/store";
import { TEST_CONFIG } from "#tests/test-config";
import { captureLog, type LogCapture } from "#tests/log-capture";
import {
  archiveSubmission,
  countPendingSubmissions,
  createSubmission,
  deleteSubmission,
  getSubmission,
  listArchivedSubmissions,
  listSubmissions,
  restoreSubmission,
} from "./staging";

const BASE_SETTINGS: SettingsInput = {
  repos: [],
  projects: [],
  labels: { prefix: "" },
  intake: {},
  sync: {
    history_days: 90,
    poll_interval_active_seconds: 30,
    poll_interval_idle_seconds: 300,
    pr_in_review: false,
    pr_done: false,
  },
  board: { done_days: 14, wip_limits: {} },
  session: { idle_days: 30 },
  notifications: { enabled: true, native: true, new_intake: true },
  planning: TEST_CONFIG.planning,
};

// All test files share one in-memory DB, so clear the staging table per test.
let logs: LogCapture;

beforeEach(() => {
  db.delete(stateTriageEvent).run();
  db.delete(stateIntakeSubmission).run();
  logs = captureLog();
});

afterEach(() => {
  clearSettings();
  logs.reset();
});

describe("intake staging store", () => {
  test("creates a row and returns an opaque id", () => {
    const { id } = createSubmission({
      title: "Crash on save",
      body: "Steps to reproduce",
      source: "cli",
    });
    expect(id).toBeString();
    expect(getSubmission(id)).toEqual({
      id,
      title: "Crash on save",
      body: "Steps to reproduce",
      source: "cli",
      createdAt: expect.any(Number),
      archivedAt: null,
      dismissReason: null,
      duplicateRepo: null,
      duplicateNumber: null,
    });
    const staged = logs.find("intake", "intake submission staged");
    expect(staged).toMatchObject({
      level: "info",
      component: "intake",
      id,
      source: "cli",
    });
    // The queue is external-facing: title/body must never reach the sink.
    expect(staged).not.toHaveProperty("title");
    expect(staged).not.toHaveProperty("body");
  });

  test("defaults body to empty and source to null", () => {
    const { id } = createSubmission({ title: "Minimal" });
    const row = getSubmission(id);
    expect(row?.body).toBe("");
    expect(row?.source).toBeNull();
  });

  test("unknown id reads as undefined", () => {
    expect(getSubmission("nope")).toBeUndefined();
  });

  test("lists newest first", () => {
    const first = createSubmission({ title: "first" });
    const second = createSubmission({ title: "second" });
    expect(listSubmissions().map((s) => s.id)).toEqual([second.id, first.id]);
  });

  test("hard-deletes, reporting whether a row was removed", () => {
    const { id } = createSubmission({ title: "drop me" });
    expect(deleteSubmission(id)).toBe(true);
    expect(getSubmission(id)).toBeUndefined();
    expect(deleteSubmission(id)).toBe(false);
  });

  test("archives pending rows and keeps them out of the queue", () => {
    const { id } = createSubmission({ title: "dismiss me" });
    expect(countPendingSubmissions()).toBe(1);
    expect(archiveSubmission(id, { dismissReason: "duplicate report" })).toBe(true);
    expect(archiveSubmission(id)).toBe(false);

    const archived = getSubmission(id);
    expect(archived?.archivedAt).toBeNumber();
    expect(archived?.dismissReason).toBe("duplicate report");
    expect(listSubmissions()).toEqual([]);
    expect(listArchivedSubmissions().map((row) => row.id)).toEqual([id]);
    expect(countPendingSubmissions()).toBe(0);
  });

  test("restores a dismissed submission and clears its archive reason", () => {
    const { id } = createSubmission({ title: "bring me back" });
    archiveSubmission(id, {
      dismissReason: "wrong queue",
      duplicateRepo: "orgA/core",
      duplicateNumber: 5,
    });

    expect(restoreSubmission(id)).toBe(true);
    expect(restoreSubmission(id)).toBe(false);

    const row = getSubmission(id);
    expect(row?.archivedAt).toBeNull();
    expect(row?.dismissReason).toBeNull();
    expect(row?.duplicateRepo).toBe("orgA/core");
    expect(row?.duplicateNumber).toBe(5);
    expect(listSubmissions().map((submission) => submission.id)).toEqual([id]);
    expect(countPendingSubmissions()).toBe(1);
  });

  test("counts only pending rows matching the search", () => {
    const first = createSubmission({ title: "Crash on save" });
    createSubmission({ title: "Dark mode" });
    archiveSubmission(first.id, { dismissReason: "already fixed" });

    expect(countPendingSubmissions()).toBe(1);
    expect(countPendingSubmissions("dark")).toBe(1);
    expect(countPendingSubmissions("crash")).toBe(0);
  });

  test("notifies admins after a submission lands", () => {
    const calls: Array<{ id: string; title: string }> = [];
    const { id } = createSubmission(
      { title: "Crash on save" },
      {
        enabled: () => true,
        notifyNewIntake: (submission) => {
          calls.push(submission);
          return 1;
        },
      },
    );

    expect(calls).toEqual([{ id, title: "Crash on save" }]);
  });

  test("skips new-intake notices when they are disabled", () => {
    let calls = 0;
    createSubmission(
      { title: "Quiet" },
      {
        enabled: () => false,
        notifyNewIntake: () => {
          calls += 1;
          return 1;
        },
      },
    );

    expect(calls).toBe(0);
  });

  test("master switch off suppresses new-intake notices", () => {
    writeSettings({
      ...BASE_SETTINGS,
      notifications: { enabled: false, native: true, new_intake: true },
    });
    let calls = 0;

    createSubmission(
      { title: "Master off" },
      {
        notifyNewIntake: () => {
          calls += 1;
          return 1;
        },
      },
    );

    expect(calls).toBe(0);
  });

  test("new-intake off suppresses notices while the master switch is on", () => {
    writeSettings({
      ...BASE_SETTINGS,
      notifications: { enabled: true, native: true, new_intake: false },
    });
    let calls = 0;

    createSubmission(
      { title: "Intake off" },
      {
        notifyNewIntake: () => {
          calls += 1;
          return 1;
        },
      },
    );

    expect(calls).toBe(0);
  });

  test("both switches on deliver a new-intake notice", () => {
    writeSettings({
      ...BASE_SETTINGS,
      notifications: { enabled: true, native: true, new_intake: true },
    });
    const calls: Array<{ id: string; title: string }> = [];

    const { id } = createSubmission(
      { title: "Both on" },
      {
        notifyNewIntake: (submission) => {
          calls.push(submission);
          return 1;
        },
      },
    );

    expect(calls).toEqual([{ id, title: "Both on" }]);
  });
});
