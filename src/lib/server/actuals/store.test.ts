import { beforeEach, describe, expect, test } from "bun:test";
import { setConfig } from "#lib/server/config";
import { db } from "#lib/server/db/index";
import { stateIssueDelay, stateIssueEvent } from "#lib/server/db/schema";
import { upsertIssue, upsertRepo } from "#lib/server/sync/mirror";
import { clearMirror } from "#tests/mirror-helpers";
import { TEST_CONFIG } from "#tests/test-config";
import {
  batchIssueTime,
  closeOpenDelays,
  createManualDelay,
  deleteDelay,
  delayTarget,
  issueTimeKey,
  listDelays,
  listIssueEvents,
  openDelay,
  updateDelay,
  type IssueTimeTarget,
} from "./store";

const ORG = "orgA";
const NAME = "core";
const ISSUE = 1;
const target: IssueTimeTarget = { org: ORG, name: NAME, number: ISSUE };
const MINUTE = 60_000;
const m = (minutes: number): number => minutes * MINUTE;

beforeEach(() => {
  clearMirror();
  db.delete(stateIssueEvent).run();
  db.delete(stateIssueDelay).run();
  setConfig(TEST_CONFIG);
});

function insertEvent(
  kind: "status" | "state" | "blocked",
  toValue: string | null,
  at: number,
): void {
  db.insert(stateIssueEvent)
    .values({
      id: crypto.randomUUID(),
      org: ORG,
      name: NAME,
      issueNumber: ISSUE,
      kind,
      fromValue: null,
      toValue,
      at,
      source: "sync",
    })
    .run();
}

function seedIssue(input: {
  size?: string | null;
  createdAt?: number;
  closedAt?: number | null;
  state?: string;
}): void {
  const repo = upsertRepo({
    externalId: "1",
    forge: "github",
    instance: "github.com",
    org: ORG,
    name: NAME,
    url: `https://github.com/${ORG}/${NAME}`,
    archived: false,
  });
  upsertIssue(
    {
      externalId: `${ORG}/${NAME}#${ISSUE}`,
      repoId: repo.id,
      number: ISSUE,
      kind: "issue",
      title: "Issue",
      body: "",
      state: input.state ?? "open",
      stateReason: null,
      author: null,
      milestoneNumber: null,
      url: "",
      createdAt: input.createdAt ?? 0,
      updatedAt: input.createdAt ?? 0,
      closedAt: input.closedAt ?? null,
      labels: [],
      assignees: [],
      comments: [],
    },
    {
      status: null,
      impact: null,
      urgency: null,
      priority: null,
      size: input.size ?? null,
      blocked: false,
      labelConflict: false,
    },
  );
}

describe("issue events", () => {
  test("lists events oldest first", () => {
    insertEvent("status", "in-progress", m(30));
    insertEvent("state", "open", m(0));
    const events = listIssueEvents(ORG, NAME, ISSUE);
    expect(events.map((event) => event.at)).toEqual([m(0), m(30)]);
    expect(events[1]).toMatchObject({
      kind: "status",
      toValue: "in-progress",
      source: "sync",
    });
  });
});

describe("manual delays", () => {
  test("creates, lists, updates and deletes", () => {
    const created = createManualDelay({
      org: ORG,
      name: NAME,
      issueNumber: ISSUE,
      reason: "dependency",
      startedAt: m(0),
      note: "waiting on the API",
    });
    expect(created).toMatchObject({
      reason: "dependency",
      startedAt: m(0),
      endedAt: null,
      note: "waiting on the API",
      source: "manual",
    });

    expect(listDelays(ORG, NAME, ISSUE)).toEqual([created]);

    const updated = updateDelay(created.id, { note: "resolved", endedAt: m(60) });
    expect(updated).toMatchObject({
      id: created.id,
      note: "resolved",
      endedAt: m(60),
    });
    expect(listDelays(ORG, NAME, ISSUE)[0].note).toBe("resolved");

    expect(deleteDelay(created.id)).toBe(true);
    expect(deleteDelay(created.id)).toBe(false);
    expect(listDelays(ORG, NAME, ISSUE)).toEqual([]);
  });

  test("accepts a closed delay on creation", () => {
    const created = createManualDelay({
      org: ORG,
      name: NAME,
      issueNumber: ISSUE,
      reason: "other",
      startedAt: m(0),
      endedAt: m(15),
    });
    expect(created.endedAt).toBe(m(15));
  });

  test("rejects updates to missing rows", () => {
    expect(updateDelay("missing", { note: "x" })).toBeUndefined();
  });

  test("lists delays oldest first", () => {
    createManualDelay({
      org: ORG,
      name: NAME,
      issueNumber: ISSUE,
      reason: "info",
      startedAt: m(30),
    });
    createManualDelay({
      org: ORG,
      name: NAME,
      issueNumber: ISSUE,
      reason: "review",
      startedAt: m(0),
    });
    expect(listDelays(ORG, NAME, ISSUE).map((delay) => delay.reason)).toEqual([
      "review",
      "info",
    ]);
  });
});

describe("blocked delays", () => {
  test("opens an automatic delay and closes it on unblock", () => {
    const opened = openDelay({
      org: ORG,
      name: NAME,
      issueNumber: ISSUE,
      reason: "external",
      startedAt: m(0),
    });
    expect(opened.source).toBe("blocked");
    expect(opened.reason).toBe("external");
    expect(closeOpenDelays(ORG, NAME, ISSUE, m(60))).toBe(1);
    expect(listDelays(ORG, NAME, ISSUE)[0].endedAt).toBe(m(60));
    expect(closeOpenDelays(ORG, NAME, ISSUE, m(90))).toBe(0);
  });

  test("closes every open delay", () => {
    openDelay({
      org: ORG,
      name: NAME,
      issueNumber: ISSUE,
      reason: "dependency",
      startedAt: m(0),
    });
    createManualDelay({
      org: ORG,
      name: NAME,
      issueNumber: ISSUE,
      reason: "info",
      startedAt: m(5),
    });
    expect(closeOpenDelays(ORG, NAME, ISSUE, m(60))).toBe(2);
    expect(listDelays(ORG, NAME, ISSUE).every((delay) => delay.endedAt === m(60))).toBe(true);
  });

  test("never closes a delay before it starts", () => {
    openDelay({
      org: ORG,
      name: NAME,
      issueNumber: ISSUE,
      reason: "capacity",
      startedAt: m(100),
    });
    closeOpenDelays(ORG, NAME, ISSUE, m(20));
    expect(listDelays(ORG, NAME, ISSUE)[0].endedAt).toBe(m(100));
  });

  test("automatic rows cannot be edited or deleted", () => {
    const blocked = openDelay({
      org: ORG,
      name: NAME,
      issueNumber: ISSUE,
      reason: "review",
      startedAt: m(0),
    });
    expect(delayTarget(blocked.id)?.source).toBe("blocked");
    expect(updateDelay(blocked.id, { note: "nope" })).toBeUndefined();
    expect(deleteDelay(blocked.id)).toBe(false);
    expect(listDelays(ORG, NAME, ISSUE)).toHaveLength(1);
  });
});

describe("batchIssueTime", () => {
  test("computes actual, delay, estimate and variance from the mirror", async () => {
    seedIssue({ size: "sm", closedAt: m(120), state: "closed" });
    insertEvent("status", "in-progress", m(0));
    insertEvent("state", "open", m(0));
    insertEvent("state", "closed", m(120));
    createManualDelay({
      org: ORG,
      name: NAME,
      issueNumber: ISSUE,
      reason: "dependency",
      startedAt: m(0),
      endedAt: m(60),
    });
    createManualDelay({
      org: ORG,
      name: NAME,
      issueNumber: ISSUE,
      reason: "external",
      startedAt: m(30),
      endedAt: m(90),
    });

    const times = await batchIssueTime([target]);
    expect(times.get(issueTimeKey(target))).toEqual({
      actualMinutes: 120,
      delayMinutes: 90,
      estimateMinutes: 120,
      varianceMinutes: 0,
      leadMinutes: 120,
      cycleMinutes: 120,
      delayCount: 2,
    });
  });

  test("returns zeroes for an unmirrored issue", async () => {
    const times = await batchIssueTime([target]);
    expect(times.get(issueTimeKey(target))).toEqual({
      actualMinutes: 0,
      delayMinutes: 0,
      estimateMinutes: null,
      varianceMinutes: null,
      leadMinutes: 0,
      cycleMinutes: 0,
      delayCount: 0,
    });
  });

  test("handles an empty target list", async () => {
    expect((await batchIssueTime([])).size).toBe(0);
  });
});
