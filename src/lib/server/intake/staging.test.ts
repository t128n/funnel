import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "#lib/server/db/index";
import { stateIntakeSubmission } from "#lib/server/db/schema";
import {
  createSubmission,
  deleteSubmission,
  getSubmission,
  listSubmissions,
} from "./staging";

// All test files share one in-memory DB, so clear the staging table per test.
beforeEach(() => {
  db.delete(stateIntakeSubmission).run();
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
    });
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
});
