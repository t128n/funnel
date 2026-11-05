import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { setConfig } from "#lib/server/config";
import { getIssueDetail, getIssueListItem } from "#lib/server/issues/queries";
import { clearMirror } from "#tests/mirror-helpers";
import { captureLog, type LogCapture } from "#tests/log-capture";
import { TEST_CONFIG } from "#tests/test-config";
import { hydrateAndStore, type GraphqlFn } from "./hydrate";
import {
  ISSUE_TYPES_QUERY,
  ISSUE_TYPE_BATCH_SIZE,
  fetchIssueTypes,
  normalizeIssueType,
  syncIssueTypes,
} from "./issue-types";
import * as mirror from "./mirror";
import { mirrorRevision } from "./revision";
import { DEPENDENCIES_QUERY, SUB_ISSUES_QUERY } from "./relations";

const ISSUE_NODE = {
  databaseId: 101,
  number: 1,
  url: "https://github.com/orgA/core/issues/1",
  title: "Source issue",
  body: "",
  state: "OPEN",
  stateReason: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-02T00:00:00Z",
  closedAt: null,
  labels: { nodes: [] },
  assignees: { nodes: [] },
  comments: { nodes: [] },
};

let repo: mirror.RepoRow;
let logs: LogCapture;

function seedRepo(): mirror.RepoRow {
  return mirror.upsertRepo({
    externalId: "1",
    forge: "github",
    instance: "github.com",
    org: "orgA",
    name: "core",
    url: "https://github.com/orgA/core",
    archived: false,
  });
}

function seedIssue(number: number): void {
  mirror.upsertIssue(
    {
      externalId: `I_${number}`,
      repoId: repo.id,
      number,
      kind: "issue",
      title: `Issue ${number}`,
      body: "",
      state: "open",
      stateReason: null,
      author: null,
      milestoneNumber: null,
      url: `https://github.com/orgA/core/issues/${number}`,
      createdAt: 1,
      updatedAt: 2,
      closedAt: null,
      labels: [],
      assignees: [],
      comments: [],
    },
    {
      status: "todo",
      impact: null,
      urgency: null,
      priority: null,
      size: null,
      blocked: false,
      labelConflict: false,
    },
  );
}

function routedGraphql(options: {
  typeNodes?: unknown[];
  typeError?: boolean;
  title?: string;
} = {}): GraphqlFn {
  return async (query) => {
    if (query === ISSUE_TYPES_QUERY) {
      if (options.typeError) throw new Error("issueType not supported");
      return { nodes: options.typeNodes ?? [] };
    }
    if (query === SUB_ISSUES_QUERY || query === DEPENDENCIES_QUERY) {
      return { nodes: [] };
    }
    return {
      nodes: [{ ...ISSUE_NODE, title: options.title ?? ISSUE_NODE.title }],
    };
  };
}

beforeEach(() => {
  clearMirror();
  setConfig(TEST_CONFIG);
  repo = seedRepo();
  logs = captureLog();
});

afterEach(() => {
  logs.reset();
});

describe("issue type normalization", () => {
  test("maps a present type name and trims it", () => {
    expect(
      normalizeIssueType({
        number: 7,
        issueType: { id: "IT_1", name: "  Bug  " },
      }),
    ).toEqual({ number: 7, issueType: "Bug" });
  });

  test("treats null and an absent field as no type", () => {
    expect(normalizeIssueType({ number: 7, issueType: null })).toEqual({
      number: 7,
      issueType: null,
    });
    expect(normalizeIssueType({ number: 7 })).toEqual({
      number: 7,
      issueType: null,
    });
  });

  test("skips malformed names and nodes without a usable number", () => {
    expect(
      normalizeIssueType({ number: 7, issueType: { id: "IT_1" } }),
    ).toBeNull();
    expect(
      normalizeIssueType({ number: 7, issueType: { name: "   " } }),
    ).toBeNull();
    expect(
      normalizeIssueType({ number: 7, issueType: { name: 42 } as never }),
    ).toBeNull();
    expect(
      normalizeIssueType({ number: 7, issueType: "Bug" as never }),
    ).toBeNull();
    expect(normalizeIssueType({ number: 0, issueType: null })).toBeNull();
    expect(normalizeIssueType({ number: "7", issueType: null })).toBeNull();
    expect(normalizeIssueType(null)).toBeNull();
  });
});

describe("fetchIssueTypes", () => {
  test("uses the dedicated query in batches of 100", async () => {
    const calls: Array<{ query: string; ids: string[] }> = [];
    const graphql: GraphqlFn = async (query, variables) => {
      calls.push({ query, ids: (variables?.ids ?? []) as string[] });
      return { nodes: [] };
    };
    const ids = Array.from(
      { length: ISSUE_TYPE_BATCH_SIZE + 1 },
      (_, index) => `n${index}`,
    );

    await fetchIssueTypes(graphql, ids);

    expect(calls.map((call) => call.query)).toEqual([
      ISSUE_TYPES_QUERY,
      ISSUE_TYPES_QUERY,
    ]);
    expect(calls[0]?.ids).toHaveLength(ISSUE_TYPE_BATCH_SIZE);
    expect(calls[1]?.ids).toHaveLength(1);
  });

  test("keys values by source number and keeps malformed entries out", async () => {
    const graphql = routedGraphql({
      typeNodes: [
        { number: 1, issueType: { id: "IT_1", name: " Bug " } },
        { number: 2, issueType: null },
        { number: 3 },
        { number: 4, issueType: { id: "IT_4" } },
      ],
    });

    const types = await fetchIssueTypes(graphql, ["n1", "n2", "n3", "n4"]);

    expect([...types.entries()]).toEqual([
      [1, "Bug"],
      [2, null],
      [3, null],
    ]);
  });
});

describe("syncIssueTypes", () => {
  test("updates existing rows and ignores numbers that are not mirrored", () => {
    seedIssue(1);
    seedIssue(2);
    const before = mirrorRevision();

    mirror.setIssueTypes(
      repo.id,
      new Map([
        [1, "Bug"],
        [2, "Feature"],
        [99, "Task"],
      ]),
    );

    expect(mirror.getIssue(repo.id, 1)?.issueType).toBe("Bug");
    expect(mirror.getIssue(repo.id, 2)?.issueType).toBe("Feature");
    expect(mirror.getIssue(repo.id, 99)).toBeUndefined();
    expect(mirrorRevision()).toBe(before + 1);
  });

  test("updates, clears, and leaves unchanged values and the revision alone", () => {
    seedIssue(1);
    mirror.setIssueTypes(repo.id, new Map([[1, "Bug"]]));
    const afterInsert = mirrorRevision();

    mirror.setIssueTypes(repo.id, new Map([[1, "Bug"]]));
    expect(mirrorRevision()).toBe(afterInsert);

    mirror.setIssueTypes(repo.id, new Map([[1, "Feature"]]));
    expect(mirror.getIssue(repo.id, 1)?.issueType).toBe("Feature");
    expect(mirrorRevision()).toBe(afterInsert + 1);

    mirror.setIssueTypes(repo.id, new Map([[1, null]]));
    expect(mirror.getIssue(repo.id, 1)?.issueType).toBeNull();
    expect(mirrorRevision()).toBe(afterInsert + 2);

    const beforeEmpty = mirrorRevision();
    mirror.setIssueTypes(repo.id, new Map());
    expect(mirrorRevision()).toBe(beforeEmpty);
  });

  test("a rejected query logs a warning and keeps prior values", async () => {
    await hydrateAndStore(
      1,
      repo.id,
      ["n1"],
      routedGraphql({
        typeNodes: [{ number: 1, issueType: { id: "IT_1", name: "Bug" } }],
      }),
      { notificationsEnabled: () => false },
    );
    expect(mirror.getIssue(repo.id, 1)?.issueType).toBe("Bug");

    await hydrateAndStore(
      1,
      repo.id,
      ["n1"],
      routedGraphql({ typeError: true, title: "Renamed with no type query" }),
      { notificationsEnabled: () => false },
    );

    expect(mirror.getIssue(repo.id, 1)?.title).toBe(
      "Renamed with no type query",
    );
    expect(mirror.getIssue(repo.id, 1)?.issueType).toBe("Bug");
    expect(logs.find("sync", "issue type hydration failed")).toMatchObject({
      level: "warn",
      component: "sync",
      repo: "orgA/core",
    });
  });

  test("successful hydration feeds the list and detail payloads", async () => {
    await hydrateAndStore(
      1,
      repo.id,
      ["n1"],
      routedGraphql({
        typeNodes: [{ number: 1, issueType: { id: "IT_1", name: "Feature" } }],
      }),
      { notificationsEnabled: () => false },
    );

    expect(getIssueListItem(repo.id, 1)?.issueType).toBe("Feature");
    expect(getIssueDetail(repo.id, 1)?.issue.issueType).toBe("Feature");
  });
});

describe("hydrateAndStore issue type isolation", () => {
  test("a type query failure does not fail the issue upsert", async () => {
    const records = await hydrateAndStore(
      1,
      repo.id,
      ["n1"],
      routedGraphql({ typeError: true }),
      { notificationsEnabled: () => false },
    );

    expect(records).toHaveLength(1);
    expect(mirror.getIssue(repo.id, 1)?.title).toBe("Source issue");
  });
});
