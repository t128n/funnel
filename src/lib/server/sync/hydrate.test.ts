import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { clearMirror } from "#tests/mirror-helpers";
import { forge } from "#/lib/server/forge/providers.server";
import { deriveMetadata } from "./conflicts";
import {
  BATCH_SIZE,
  chunk,
  HYDRATE_QUERY,
  hydrateAndStore,
  hydrateNodes,
  normalizeNode,
  type GraphqlFn,
} from "./hydrate";
import * as mirror from "./mirror";

let repoId = 0;

beforeEach(() => {
  clearMirror();
  repoId = mirror.upsertRepo({
    externalId: "1",
    forge: "github",
    instance: "github.com",
    org: "orgA",
    name: "core",
    url: "https://github.com/orgA/core",
    archived: false,
  }).id;
});

const ISSUE_NODE = {
  databaseId: 101,
  number: 1,
  url: "https://github.com/orgA/core/issues/1",
  title: "Fix the thing",
  body: "Body text",
  state: "OPEN",
  stateReason: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-02T00:00:00Z",
  closedAt: null,
  author: { databaseId: 7, login: "octocat", avatarUrl: "https://a/7" },
  milestone: { number: 3 },
  labels: { nodes: [{ name: "todo" }, { name: "bug" }] },
  assignees: { nodes: [{ databaseId: 8, login: "dev", avatarUrl: "https://a/8" }] },
  comments: {
    nodes: [
      {
        databaseId: 500,
        author: { databaseId: 7, login: "octocat", avatarUrl: "https://a/7" },
        body: "a comment",
        createdAt: "2026-01-02T00:00:00Z",
        updatedAt: "2026-01-02T01:00:00Z",
      },
    ],
  },
};

describe("normalizeNode", () => {
  test("maps a GraphQL issue node to a mirror record", () => {
    const record = normalizeNode(ISSUE_NODE, repoId);
    expect(record).toMatchObject({
      externalId: "101",
      repoId,
      number: 1,
      kind: "issue",
      url: "https://github.com/orgA/core/issues/1",
      title: "Fix the thing",
      state: "open",
      milestoneNumber: 3,
      labels: ["todo", "bug"],
      author: { externalId: "7", login: "octocat" },
    });
    expect(record?.assignees).toEqual([
      {
        id: 0,
        externalId: "8",
        forge: "github",
        instance: "github.com",
        login: "dev",
        avatarUrl: "https://a/8",
        url: "",
      },
    ]);
    expect(record?.comments).toEqual([
      {
        externalId: "500",
        author: {
          id: 0,
          externalId: "7",
          forge: "github",
          instance: "github.com",
          login: "octocat",
          avatarUrl: "https://a/7",
          url: "",
        },
        body: "a comment",
        createdAt: Date.parse("2026-01-02T00:00:00Z"),
        updatedAt: Date.parse("2026-01-02T01:00:00Z"),
      },
    ]);
    expect(record?.updatedAt).toBe(Date.parse("2026-01-02T00:00:00Z"));
  });

  test("lowercases GraphQL state enum values (Inbox/board predicates)", () => {
    const record = normalizeNode(
      {
        ...ISSUE_NODE,
        state: "CLOSED",
        stateReason: "COMPLETED",
        closedAt: "2026-01-03T00:00:00Z",
      },
      1,
    );
    expect(record?.state).toBe("closed");
    expect(record?.stateReason).toBe("completed");
  });

  test("drops pull requests (empty node from the Issue fragment)", () => {
    expect(normalizeNode({}, 1)).toBeNull();
    expect(normalizeNode(null, 1)).toBeNull();
  });

  test("drops actors without a numeric databaseId", () => {
    const record = normalizeNode(
      { ...ISSUE_NODE, author: { login: "dependabot" } },
      1,
    );
    expect(record?.author).toBeNull();
  });
});

describe("chunk", () => {
  test("splits into fixed-size batches", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });
});

describe("hydrateNodes", () => {
  test("issues one query per 100 ids and drops PRs", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const graphql: GraphqlFn = async (query, variables) => {
      expect(query).toBe(HYDRATE_QUERY);
      calls.push(variables ?? {});
      const ids = (variables?.ids ?? []) as string[];
      return {
        nodes: ids.map((id) =>
          id === "pr" ? {} : { ...ISSUE_NODE, databaseId: Number(id) },
        ),
      };
    };

    const ids = [
      ...Array.from({ length: BATCH_SIZE }, (_, i) => String(i + 1)),
      "pr",
    ];
    const records = await hydrateNodes(graphql, repoId, ids);

    expect(calls).toHaveLength(2);
    expect((calls[0].ids as string[]).length).toBe(BATCH_SIZE);
    expect(records).toHaveLength(BATCH_SIZE);
  });
});

describe("hydrateAndStore", () => {
  test("persists records with derived metadata", async () => {
    const graphql: GraphqlFn = async () => ({ nodes: [ISSUE_NODE] });
    const records = await hydrateAndStore(1, repoId, ["n1"], graphql);

    expect(records).toHaveLength(1);
    const stored = mirror.getIssue(repoId, 1);
    expect(stored?.title).toBe("Fix the thing");
    expect(stored?.externalId).toBe("101");
    expect(stored?.kind).toBe("issue");
    expect(stored?.url).toBe("https://github.com/orgA/core/issues/1");
    expect(stored?.status).toBe("todo");
    expect(stored?.labelConflict).toBe(0);
    expect(mirror.getIssueLabels(repoId, 1).sort()).toEqual(["bug", "todo"]);
  });

  test("caches impact/urgency labels and derives priority", async () => {
    const graphql: GraphqlFn = async () => ({
      nodes: [
        {
          ...ISSUE_NODE,
          labels: {
            nodes: [{ name: "todo" }, { name: "sev" }, { name: "high" }],
          },
        },
      ],
    });
    await hydrateAndStore(1, repoId, ["n1"], graphql);

    const stored = mirror.getIssue(repoId, 1);
    expect(stored?.impact).toBe(1);
    expect(stored?.urgency).toBe(1);
    expect(stored?.priority).toBe("P1");
    expect(stored?.labelConflict).toBe(0);
  });

  test("flags a retired p-label that disagrees with the axes", async () => {
    const graphql: GraphqlFn = async () => ({
      nodes: [
        {
          ...ISSUE_NODE,
          labels: {
            nodes: [
              { name: "todo" },
              { name: "min" },
              { name: "low" },
              { name: "p1" },
            ],
          },
        },
      ],
    });
    await hydrateAndStore(1, repoId, ["n1"], graphql);

    expect(mirror.getIssue(repoId, 1)?.priority).toBe("P3");
    expect(mirror.getIssue(repoId, 1)?.labelConflict).toBe(1);
  });

  test("flags a conflicted label set for later resolution", async () => {
    const graphql: GraphqlFn = async () => ({
      nodes: [
        {
          ...ISSUE_NODE,
          labels: { nodes: [{ name: "todo" }, { name: "in-progress" }] },
        },
      ],
    });
    await hydrateAndStore(1, repoId, ["n1"], graphql);
    expect(mirror.getIssue(repoId, 1)?.labelConflict).toBe(1);
    expect(deriveMetadata(["todo", "in-progress"]).conflicts).toEqual(["status"]);
  });
});

const fakeGraphql = async () => ({
  nodes: [{ databaseId: 101, number: 1, url: "https://github.com/orgA/core/issues/1", title: "live", state: "OPEN", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", labels: { nodes: [] }, assignees: { nodes: [] }, comments: { nodes: [] } }],
});

describe("hydrateAndStore injection", () => {
  test("stores normalized nodes from the injected graphql", async () => {
    const records = await hydrateAndStore(7, repoId, ["n1"], fakeGraphql as never);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      externalId: "101",
      number: 1,
      title: "live",
    });
  });
  test("does nothing for an empty batch", async () => {
    expect(await hydrateAndStore(7, repoId, [], fakeGraphql as never)).toEqual([]);
  });
});

describe("hydrateAndStore provider", () => {
  const provider = {
    marker: "provider",
    async graphql(_query: string, _variables?: Record<string, unknown>) {
      // An unbound method call would lose `this`.
      expect(this.marker).toBe("provider");
      return { nodes: [ISSUE_NODE] };
    },
  };
  let providerSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    providerSpy = spyOn(forge, "installationProvider").mockResolvedValue(
      provider as never,
    );
  });

  afterEach(() => {
    providerSpy.mockRestore();
  });

  test("calls the provider graphql through a bound function", async () => {
    const records = await hydrateAndStore(7, repoId, ["n1"]);

    expect(providerSpy).toHaveBeenCalledWith(7);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ externalId: "101", number: 1 });
  });
});
