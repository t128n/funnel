import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { db } from "#lib/server/db/index";
import {
  mirrorThread,
  stateIssueWaiting,
} from "#lib/server/db/schema";
import {
  upsertIssue,
  upsertRepo,
  type IssueRecord,
} from "#lib/server/sync/mirror";
import {
  clearWaiting,
  getWaiting,
  isWaiting,
  isWaitingStale,
  listWaiting,
  MAX_WAITING_NOTE_LENGTH,
  setWaiting,
  validateWaitingInput,
} from "#lib/server/waiting";
import { clearMirror } from "#tests/mirror-helpers";

const DAY_MS = 86_400_000;
/** Local noon, so calendar-day arithmetic is unambiguous in any DST zone. */
const NOW = new Date(2026, 9, 18, 12, 0, 0).getTime();

function seedRepo(): number {
  return upsertRepo({
    externalId: "1",
    forge: "github",
    instance: "github.com",
    org: "orgA",
    name: "core",
    url: "https://github.com/orgA/core",
    archived: false,
  }).id;
}

function seedIssue(repoId: number, number: number, body = "Original body"): void {
  const record: IssueRecord = {
    externalId: String(100 + number),
    repoId,
    number,
    kind: "issue",
    title: `Issue ${number}`,
    body,
    state: "open",
    stateReason: null,
    author: null,
    milestoneNumber: null,
    url: `https://github.com/orgA/core/issues/${number}`,
    createdAt: 1,
    updatedAt: 1,
    closedAt: null,
    labels: [],
    assignees: [],
    comments: [],
  };
  upsertIssue(record, {
    status: "todo",
    impact: null,
    urgency: null,
    priority: null,
    size: null,
    blocked: false,
    labelConflict: false,
  });
}

beforeEach(() => {
  db.delete(stateIssueWaiting).run();
  clearMirror();
  seedIssue(seedRepo(), 1);
});

afterEach(() => {
  db.delete(stateIssueWaiting).run();
});

describe("waiting validation", () => {
  test("accepts the fixed reasons and a real ISO date", () => {
    expect(
      validateWaitingInput({
        reason: "waiting-on-vendor",
        note: "  Ticket open  ",
        recheckOn: "2026-10-25",
      }),
    ).toEqual({
      ok: true,
      value: {
        reason: "waiting-on-vendor",
        note: "Ticket open",
        recheckOn: "2026-10-25",
      },
    });
    expect(
      validateWaitingInput({ reason: "needs-info", note: "   ", recheckOn: null }),
    ).toEqual({
      ok: true,
      value: { reason: "needs-info", note: null, recheckOn: null },
    });
  });

  test("rejects unknown reasons, malformed dates and over-long notes", () => {
    expect(validateWaitingInput({ reason: "bored" })).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(
      validateWaitingInput({ reason: "other", recheckOn: "2026-02-30" }),
    ).toMatchObject({ ok: false, status: 400 });
    expect(
      validateWaitingInput({
        reason: "other",
        note: "x".repeat(MAX_WAITING_NOTE_LENGTH + 1),
      }),
    ).toMatchObject({ ok: false, status: 400 });
  });
});

describe("waiting store", () => {
  test("sets, reads, updates and clears a row", () => {
    const created = setWaiting(
      "orgA/core",
      1,
      { reason: "needs-info", note: "Ask for repro", recheckOn: "2026-10-25" },
      "user-1",
      NOW,
    );
    expect(created.ok).toBe(true);
    expect(isWaiting("orgA/core", 1)).toBe(true);
    expect(getWaiting("orgA/core", 1)).toMatchObject({
      reason: "needs-info",
      note: "Ask for repro",
      recheckOn: "2026-10-25",
      actorUserId: "user-1",
      waitingSince: NOW,
    });

    // Revising the reason/date keeps the original `waitingSince`.
    const updated = setWaiting(
      "orgA/core",
      1,
      { reason: "waiting-on-reporter", note: null, recheckOn: null },
      "user-2",
      NOW + 2 * DAY_MS,
    );
    expect(updated).toMatchObject({
      ok: true,
      value: {
        reason: "waiting-on-reporter",
        note: null,
        recheckOn: null,
        waitingSince: NOW,
      },
    });
    expect(listWaiting(NOW).map((entry) => entry.number)).toEqual([1]);

    expect(clearWaiting("orgA/core", 1)).toBe(true);
    expect(clearWaiting("orgA/core", 1)).toBe(false);
    expect(getWaiting("orgA/core", 1)).toBeUndefined();
  });

  test("rejects malformed repo slugs and issue numbers", () => {
    expect(setWaiting("orgA", 1, { reason: "other" })).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(setWaiting("orgA/core", 0, { reason: "other" })).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(setWaiting("", 1, { reason: "other" })).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(clearWaiting("orgA/core", -1)).toBe(false);
    expect(getWaiting("orgA", 1)).toBeUndefined();
  });

  test("marks 6- and 7-day waits current and 8-day waits stale", () => {
    const days = [6, 7, 8];
    days.forEach((age) => {
      setWaiting(
        "orgA/core",
        age,
        { reason: "waiting-on-upstream" },
        null,
        NOW - age * DAY_MS,
      );
    });

    const entries = listWaiting(NOW);
    expect(
      entries.map((entry) => [entry.number, entry.days, entry.stale]),
    ).toEqual([
      [8, 8, true],
      [7, 7, false],
      [6, 6, false],
    ]);
    expect(isWaitingStale({ waitingSince: NOW - 7 * DAY_MS }, NOW)).toBe(false);
    expect(isWaitingStale({ waitingSince: NOW - 8 * DAY_MS }, NOW)).toBe(true);
  });
});

describe("waiting durability", () => {
  test("survives mirror pruning and a re-sync without touching the body", () => {
    const repoId = upsertRepo({
      externalId: "1",
      forge: "github",
      instance: "github.com",
      org: "orgA",
      name: "core",
      url: "https://github.com/orgA/core",
      archived: false,
    }).id;
    seedIssue(repoId, 2, "The reporter's exact words");

    const before = db
      .select({ body: mirrorThread.body })
      .from(mirrorThread)
      .all()
      .find((row) => row.body === "The reporter's exact words");
    expect(before?.body).toBe("The reporter's exact words");

    expect(
      setWaiting(
        "orgA/core",
        2,
        { reason: "waiting-on-reporter", note: "Need logs" },
        "user-1",
        NOW,
      ).ok,
    ).toBe(true);

    // Pruning wipes the disposable mirror but not Funnel-owned state.
    clearMirror();
    expect(isWaiting("orgA/core", 2)).toBe(true);
    expect(getWaiting("orgA/core", 2)?.reason).toBe("waiting-on-reporter");

    // A re-sync re-adds the issue under a new mirror id; the row still matches
    // by repo slug + number.
    const again = upsertRepo({
      externalId: "1",
      forge: "github",
      instance: "github.com",
      org: "orgA",
      name: "core",
      url: "https://github.com/orgA/core",
      archived: false,
    }).id;
    seedIssue(again, 2, "The reporter's exact words");
    expect(getWaiting("orgA/core", 2)).toBeDefined();

    // Clearing the state is equally body-free.
    expect(clearWaiting("orgA/core", 2)).toBe(true);
    const after = db
      .select({ body: mirrorThread.body })
      .from(mirrorThread)
      .all()
      .find((row) => row.body === "The reporter's exact words");
    expect(after?.body).toBe("The reporter's exact words");
  });
});
