import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { addDaysISO } from "#lib/attention";
import { writeBlocked } from "#lib/funnel-metadata";
import { resetConfigCache, setConfig } from "#lib/server/config";
import { db } from "#lib/server/db/index";
import { stateIssueWaiting } from "#lib/server/db/schema";
import {
  upsertIssue,
  upsertRepo,
  type CommentRecord,
  type IssueRecord,
  type UserRecord,
} from "#lib/server/sync/mirror";
import { setWaiting } from "#lib/server/waiting";
import { clearMirror } from "#tests/mirror-helpers";
import { TEST_CONFIG } from "#tests/test-config";
import { attentionBreaches } from "./queries";

const DAY_MS = 86_400_000;
const NOW = new Date(2026, 10, 5, 12).getTime();

function user(externalId: string, login: string): UserRecord {
  return {
    id: 0,
    externalId,
    forge: "github",
    instance: "github.com",
    login,
    avatarUrl: "",
    url: "",
  };
}

function comment(externalId: string, author: UserRecord | null): CommentRecord {
  return {
    externalId,
    author,
    body: "hello",
    createdAt: NOW - DAY_MS,
    updatedAt: NOW - DAY_MS,
  };
}

function seedIssue(
  number: number,
  overrides: Partial<IssueRecord> = {},
  blocked = false,
): void {
  const base: IssueRecord = {
    externalId: String(100 + number),
    repoId: 1,
    number,
    kind: "issue",
    title: `Issue ${number}`,
    body: "",
    state: "open",
    stateReason: null,
    author: user("1", "author"),
    milestoneNumber: null,
    url: "",
    createdAt: NOW - 5 * DAY_MS,
    updatedAt: NOW - DAY_MS,
    closedAt: null,
    labels: [],
    assignees: [],
    comments: [],
    ...overrides,
  };
  upsertIssue(base, {
    status: "todo",
    impact: null,
    urgency: null,
    priority: null,
    size: null,
    blocked,
    labelConflict: false,
  });
}

function configWith(attention: Partial<typeof TEST_CONFIG.attention>) {
  return setConfig({
    ...TEST_CONFIG,
    attention: { ...TEST_CONFIG.attention, ...attention },
  });
}

beforeEach(() => {
  clearMirror();
  db.delete(stateIssueWaiting).run();
  upsertRepo({
    externalId: "1",
    forge: "github",
    instance: "github.com",
    org: "orgA",
    name: "core",
    url: "https://github.com/orgA/core",
    archived: false,
  });
  configWith({});
});

afterEach(() => {
  clearMirror();
  db.delete(stateIssueWaiting).run();
  resetConfigCache();
});

describe("attentionBreaches", () => {
  test("returns an empty list for empty data", async () => {
    expect(await attentionBreaches(NOW)).toEqual([]);
  });

  test("gathers first-response breaches with comment history and assignees", async () => {
    const ann = user("42", "ann");
    seedIssue(1, { assignees: [ann] });
    seedIssue(2, {
      comments: [comment("c1", user("3", "reviewer"))],
    });

    const breaches = await attentionBreaches(NOW);
    expect(breaches).toHaveLength(1);
    expect(breaches[0]).toMatchObject({
      id: "first_response:orgA/core#1",
      rule: "first_response",
      repo: "orgA/core",
      number: 1,
      title: "Issue 1",
    });
    expect(breaches[0].assignees).toEqual([
      {
        externalId: "42",
        forge: "github",
        instance: "github.com",
        login: "ann",
        avatarUrl: "",
      },
    ]);
  });

  test("includes waiting and re-check breaches only while the issue is open", async () => {
    const blockedBody = writeBlocked("desc", {
      blocker: "Upstream",
      needs: "Token",
      trying: "",
      recheck: addDaysISO(
        new Date(NOW).toISOString().slice(0, 10),
        -8,
      ),
    });
    seedIssue(
      3,
      {
        body: blockedBody,
        createdAt: NOW,
        updatedAt: NOW,
      },
      true,
    );
    seedIssue(4, { state: "closed", closedAt: NOW - DAY_MS });
    setWaiting("orgA/core", 3, { reason: "other" }, null, NOW - 8 * DAY_MS);
    setWaiting("orgA/core", 4, { reason: "other" }, null, NOW - 8 * DAY_MS);

    const breaches = await attentionBreaches(NOW);
    expect(breaches.map((breach) => breach.id).sort()).toEqual([
      "recheck:orgA/core#3",
      "waiting:orgA/core#3",
    ]);
  });

  test("a zero threshold removes that rule's breaches", async () => {
    seedIssue(1);

    configWith({
      first_response_days: 0,
      stale_open_days: 0,
      recheck_cadence_days: 0,
      waiting_days: 0,
    });

    expect(await attentionBreaches(NOW)).toEqual([]);
  });

  test("stale open follows the configured instant threshold", async () => {
    seedIssue(1, { updatedAt: NOW - 31 * DAY_MS });

    expect(
      (await attentionBreaches(NOW)).map((breach) => breach.rule),
    ).toContain("stale_open");

    configWith({ stale_open_days: 0 });
    expect(
      (await attentionBreaches(NOW)).map((breach) => breach.rule),
    ).not.toContain("stale_open");
  });
});
