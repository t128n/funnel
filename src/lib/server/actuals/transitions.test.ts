import { beforeEach, describe, expect, test } from "bun:test";
import { asc } from "drizzle-orm";
import { writeBlocked } from "#lib/funnel-metadata";
import { db } from "#lib/server/db/index";
import { stateIssueDelay, stateIssueEvent } from "#lib/server/db/schema";
import { upsertRepo } from "#lib/server/sync/mirror";
import { hydrateAndStore, type GraphqlFn } from "#lib/server/sync/hydrate";
import { clearMirror } from "#tests/mirror-helpers";
import { closeOpenDelays, listDelays, openDelay } from "./store";
import type { DelayReason } from "./reasons";
import type {
  IssueTransitionSnapshot,
  RecordIssueTransitionsInput,
} from "./transitions";
import { recordIssueTransitions } from "./transitions";

const ORG = "orgA";
const NAME = "core";
const ISSUE = 1;
const AT = 10_000;

const INFO = {
  blocker: "Waiting on the API",
  needs: "A scoped token",
  trying: "",
  recheck: "",
} as const;

function blockedBody(reason: DelayReason = "dependency"): string {
  return writeBlocked("Description", { ...INFO, reason });
}

function snapshot(
  overrides: Partial<IssueTransitionSnapshot> = {},
): IssueTransitionSnapshot {
  return { status: "backlog", state: "open", blocked: false, ...overrides };
}

function record(
  previous: IssueTransitionSnapshot | null,
  next: IssueTransitionSnapshot,
  overrides: Partial<RecordIssueTransitionsInput> = {},
): void {
  recordIssueTransitions({
    org: ORG,
    name: NAME,
    issueNumber: ISSUE,
    previous,
    next,
    body: blockedBody(),
    at: AT,
    closedAt: null,
    source: "sync",
    ...overrides,
  });
}

function events() {
  return db
    .select()
    .from(stateIssueEvent)
    .orderBy(asc(stateIssueEvent.at), asc(stateIssueEvent.kind))
    .all();
}

function delays() {
  return listDelays(ORG, NAME, ISSUE);
}

beforeEach(() => {
  db.delete(stateIssueEvent).run();
  db.delete(stateIssueDelay).run();
});

describe("recordIssueTransitions", () => {
  test("test_first_sight_baselines", () => {
    record(null, snapshot({ status: "in-progress" }));

    const rows = events();
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.at === AT)).toBe(true);
    expect(rows.every((row) => row.fromValue === null)).toBe(true);
    expect(rows.every((row) => row.source === "sync")).toBe(true);
    expect(
      Object.fromEntries(rows.map((row) => [row.kind, row.toValue])),
    ).toEqual({
      status: "in-progress",
      state: "open",
      blocked: "false",
    });
    expect(delays()).toEqual([]);
  });

  test("a first sighting that is blocked opens a delay", () => {
    record(null, snapshot({ blocked: true }));

    expect(events()).toHaveLength(3);
    expect(delays()).toHaveLength(1);
    expect(delays()[0]).toMatchObject({
      source: "blocked",
      reason: "dependency",
      startedAt: AT,
      endedAt: null,
    });
  });

  test("test_status_change_appends", () => {
    record(snapshot({ status: "backlog" }), snapshot({ status: "in-progress" }));

    const rows = events();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "status",
      fromValue: "backlog",
      toValue: "in-progress",
      at: AT,
    });
    expect(delays()).toEqual([]);
  });

  test("test_no_change_writes_nothing", () => {
    record(snapshot(), snapshot());

    expect(events()).toEqual([]);
    expect(delays()).toEqual([]);
  });

  test("a state change appends a state event", () => {
    record(snapshot({ state: "open" }), snapshot({ state: "closed" }));

    expect(events()).toHaveLength(1);
    expect(events()[0]).toMatchObject({
      kind: "state",
      fromValue: "open",
      toValue: "closed",
    });
  });

  test("test_blocked_opens_delay", () => {
    record(snapshot({ blocked: false }), snapshot({ blocked: true }));

    const rows = events();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "blocked",
      fromValue: "false",
      toValue: "true",
    });
    expect(delays()).toHaveLength(1);
    expect(delays()[0]).toMatchObject({
      source: "blocked",
      reason: "dependency",
      startedAt: AT,
      endedAt: null,
    });
  });

  test("a block without a body reason defaults to other", () => {
    record(snapshot(), snapshot({ blocked: true }), { body: "plain body" });
    expect(delays()[0].reason).toBe("other");
  });

  test("test_unblock_closes_delay", () => {
    openDelay({
      org: ORG,
      name: NAME,
      issueNumber: ISSUE,
      reason: "external",
      startedAt: 0,
    });
    record(snapshot({ blocked: true }), snapshot({ blocked: false }));

    expect(events()[0]).toMatchObject({ kind: "blocked", toValue: "false" });
    expect(delays()).toHaveLength(1);
    expect(delays()[0].endedAt).toBe(AT);
  });

  test("test_close_closes_active_and_delays", () => {
    openDelay({
      org: ORG,
      name: NAME,
      issueNumber: ISSUE,
      reason: "review",
      startedAt: 0,
    });
    record(snapshot({ blocked: true }), snapshot({ state: "closed", blocked: true }), {
      closedAt: 8000,
    });

    expect(events()).toHaveLength(1);
    expect(events()[0]).toMatchObject({
      kind: "state",
      toValue: "closed",
      at: AT,
    });
    expect(delays()[0].endedAt).toBe(8000);
  });

  test("test_reopen_blocked_opens_new_delay", () => {
    openDelay({
      org: ORG,
      name: NAME,
      issueNumber: ISSUE,
      reason: "dependency",
      startedAt: 0,
    });
    closeOpenDelays(ORG, NAME, ISSUE, 5000);

    record(
      snapshot({ state: "closed", blocked: true }),
      snapshot({ state: "open", blocked: true }),
    );

    expect(events()).toHaveLength(1);
    expect(events()[0]).toMatchObject({ kind: "state", toValue: "open" });
    const rows = delays();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ startedAt: 0, endedAt: 5000 });
    expect(rows[1]).toMatchObject({
      startedAt: AT,
      endedAt: null,
      source: "blocked",
      reason: "dependency",
    });
  });

  test("reopening an unblocked issue opens no delay", () => {
    record(
      snapshot({ state: "closed", blocked: false }),
      snapshot({ state: "open", blocked: false }),
    );
    expect(delays()).toEqual([]);
  });

  test("a blocked issue closed again does not open a delay", () => {
    record(
      snapshot({ state: "closed", blocked: true }),
      snapshot({ state: "closed", blocked: true }),
      { closedAt: 8000 },
    );
    expect(events()).toEqual([]);
    expect(delays()).toEqual([]);
  });
});

describe("hydrateAndStore wiring", () => {
  function node(overrides: Record<string, unknown> = {}) {
    return {
      databaseId: 101,
      number: ISSUE,
      url: `https://github.com/${ORG}/${NAME}/issues/${ISSUE}`,
      title: "Issue",
      body: "Description",
      state: "OPEN",
      stateReason: null,
      createdAt: new Date(1000).toISOString(),
      updatedAt: new Date(2000).toISOString(),
      closedAt: null,
      repository: { databaseId: 1 },
      author: null,
      milestone: null,
      labels: { nodes: [{ name: "in-progress" }] },
      assignees: { nodes: [] },
      comments: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
      ...overrides,
    };
  }

  function seedRepo(): number {
    clearMirror();
    return upsertRepo({
      externalId: "1",
      forge: "github",
      instance: "github.com",
      org: ORG,
      name: NAME,
      url: `https://github.com/${ORG}/${NAME}`,
      archived: false,
    }).id;
  }

  test("baselines a first sighting and writes nothing when it is unchanged", async () => {
    const repoId = seedRepo();
    const gql: GraphqlFn = async () => ({ nodes: [node()] });

    await hydrateAndStore(1, repoId, ["n1"], gql, {
      notificationsEnabled: () => false,
    });
    expect(events()).toHaveLength(3);

    await hydrateAndStore(1, repoId, ["n1"], gql, {
      notificationsEnabled: () => false,
    });
    expect(events()).toHaveLength(3);
  });

  test("opens an automatic delay from a blocked body", async () => {
    const repoId = seedRepo();
    const gql: GraphqlFn = async () => ({
      nodes: [node({ body: blockedBody("review"), labels: { nodes: [{ name: "blocked" }] } })],
    });

    await hydrateAndStore(1, repoId, ["n1"], gql, {
      notificationsEnabled: () => false,
    });

    expect(delays()).toHaveLength(1);
    expect(delays()[0]).toMatchObject({
      source: "blocked",
      reason: "review",
      endedAt: null,
    });
  });
});
