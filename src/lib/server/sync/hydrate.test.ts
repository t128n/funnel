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

beforeEach(() => {
  clearMirror();
  mirror.upsertRepo({ githubId: 1, org: "orgA", name: "core", archived: false });
});

const ISSUE_NODE = {
  databaseId: 101,
  number: 1,
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
    const record = normalizeNode(ISSUE_NODE, 1);
    expect(record).toMatchObject({
      githubId: 101,
      repoId: 1,
      number: 1,
      title: "Fix the thing",
      state: "open",
      milestoneNumber: 3,
      labels: ["todo", "bug"],
      author: { githubId: 7, login: "octocat" },
    });
    expect(record?.assignees).toEqual([
      { githubId: 8, login: "dev", avatarUrl: "https://a/8" },
    ]);
    expect(record?.comments).toEqual([
      {
        githubId: 500,
        author: { githubId: 7, login: "octocat", avatarUrl: "https://a/7" },
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
    const records = await hydrateNodes(graphql, 1, ids);

    expect(calls).toHaveLength(2);
    expect((calls[0].ids as string[]).length).toBe(BATCH_SIZE);
    expect(records).toHaveLength(BATCH_SIZE);
  });
});

describe("hydrateAndStore", () => {
  test("persists records with derived metadata", async () => {
    const graphql: GraphqlFn = async () => ({ nodes: [ISSUE_NODE] });
    const records = await hydrateAndStore(1, 1, ["n1"], graphql);

    expect(records).toHaveLength(1);
    const stored = mirror.getIssue(1, 1);
    expect(stored?.title).toBe("Fix the thing");
    expect(stored?.status).toBe("todo");
    expect(stored?.labelConflict).toBe(0);
    expect(mirror.getIssueLabels(1, 1).sort()).toEqual(["bug", "todo"]);
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
    await hydrateAndStore(1, 1, ["n1"], graphql);
    expect(mirror.getIssue(1, 1)?.labelConflict).toBe(1);
    expect(deriveMetadata(["todo", "in-progress"]).conflicts).toEqual(["status"]);
  });
});

const fakeGraphql = async () => ({
  nodes: [{ databaseId: 101, number: 1, title: "live", state: "OPEN", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", labels: { nodes: [] }, assignees: { nodes: [] }, comments: { nodes: [] } }],
});

describe("hydrateAndStore injection", () => {
  test("stores normalized nodes from the injected graphql", async () => {
    const records = await hydrateAndStore(7, 1, ["n1"], fakeGraphql as never);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ githubId: 101, number: 1, title: "live" });
  });
  test("does nothing for an empty batch", async () => {
    expect(await hydrateAndStore(7, 1, [], fakeGraphql as never)).toEqual([]);
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
    const records = await hydrateAndStore(7, 1, ["n1"]);

    expect(providerSpy).toHaveBeenCalledWith(7);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ githubId: 101, number: 1 });
  });
});
