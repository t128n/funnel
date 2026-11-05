import { beforeEach, describe, expect, test } from "bun:test";
import { setConfig } from "#lib/server/config";
import { getIssueDetail } from "#lib/server/issues/queries";
import { clearMirror } from "#tests/mirror-helpers";
import { TEST_CONFIG } from "#tests/test-config";
import { hydrateAndStore, type GraphqlFn } from "./hydrate";
import * as mirror from "./mirror";
import {
  DEPENDENCIES_QUERY,
  MAX_RELATIONS_PER_KIND,
  RELATION_BATCH_SIZE,
  SUB_ISSUES_QUERY,
  fetchDependencyRelations,
  fetchSubIssueRelations,
  normalizeDependencies,
  normalizeRelationList,
  normalizeSubIssues,
} from "./relations";

const ISSUE_NODE = {
  databaseId: 101,
  number: 1,
  url: "https://github.com/orgA/core/issues/1",
  title: "Source issue",
  body: "",
  state: "OPEN",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-02T00:00:00Z",
  labels: { nodes: [] },
  assignees: { nodes: [] },
  comments: { nodes: [] },
};

let repo: mirror.RepoRow;

function seedRepo(org = "orgA", name = "core", externalId = "1"): mirror.RepoRow {
  return mirror.upsertRepo({
    externalId,
    forge: "github",
    instance: "github.com",
    org,
    name,
    url: `https://github.com/${org}/${name}`,
    archived: false,
  });
}

function seedIssue(number: number, title = `Issue ${number}`): void {
  mirror.upsertIssue(
    {
      externalId: `I_${number}`,
      repoId: repo.id,
      number,
      kind: "issue",
      title,
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

function ref(
  number: number,
  overrides: {
    repo?: string;
    title?: string;
    state?: string;
    url?: string;
  } = {},
) {
  return {
    repo: overrides.repo ?? "orgA/core",
    number,
    title: overrides.title === undefined ? `Related ${number}` : overrides.title,
    state: overrides.state === undefined ? "OPEN" : overrides.state,
    url: overrides.url ?? `https://example.test/issues/${number}`,
    repository: {
      nameWithOwner: overrides.repo ?? "orgA/core",
    },
  };
}

function subNode(
  source: number,
  children: unknown[] = [],
  parent: unknown = null,
) {
  return { number: source, parent, subIssues: { nodes: children } };
}

function dependencyNode(
  source: number,
  blockedBy: unknown[] = [],
  blocking: unknown[] = [],
) {
  return { number: source, blockedBy: { nodes: blockedBy }, blocking: { nodes: blocking } };
}

function routedGraphql(options: {
  subNodes?: unknown[];
  dependencyNodes?: unknown[];
  subError?: boolean;
  dependencyError?: boolean;
}): GraphqlFn {
  return async (query) => {
    if (query === SUB_ISSUES_QUERY) {
      if (options.subError) throw new Error("subIssues not supported");
      return { nodes: options.subNodes ?? [] };
    }
    if (query === DEPENDENCIES_QUERY) {
      if (options.dependencyError) throw new Error("blockedBy not supported");
      return { nodes: options.dependencyNodes ?? [] };
    }
    return { nodes: [ISSUE_NODE] };
  };
}

beforeEach(() => {
  clearMirror();
  setConfig(TEST_CONFIG);
  repo = seedRepo();
});

describe("relation normalization", () => {
  test("maps parent and children, lower-cases state and falls back to the source repo", () => {
    const result = normalizeSubIssues(
      {
        number: 1,
        parent: ref(2, {
          repo: "orgB/platform",
          title: "Parent",
          state: "OPEN",
        }),
        subIssues: {
          nodes: [
            ref(5, { repo: "orgB/web", state: "CLOSED", title: "Cross-repo" }),
            { ...ref(3, { state: "OPEN" }), title: null },
            { ...ref(4, { title: "Fallback repo" }), repository: null },
            { ...ref(9), repository: {} },
          ],
        },
      },
      "orgA/core",
    );

    expect(result.parent).toEqual({
      repo: "orgB/platform",
      number: 2,
      title: "Parent",
      state: "open",
      url: "https://example.test/issues/2",
    });
    expect(result.children).toEqual([
      {
        repo: "orgA/core",
        number: 3,
        title: "",
        state: "open",
        url: "https://example.test/issues/3",
      },
      {
        repo: "orgA/core",
        number: 4,
        title: "Fallback repo",
        state: "open",
        url: "https://example.test/issues/4",
      },
      {
        repo: "orgA/core",
        number: 9,
        title: "Related 9",
        state: "open",
        url: "https://example.test/issues/9",
      },
      {
        repo: "orgB/web",
        number: 5,
        title: "Cross-repo",
        state: "closed",
        url: "https://example.test/issues/5",
      },
    ]);
  });

  test("drops malformed refs, deduplicates and sorts by repo then number", () => {
    const result = normalizeSubIssues(
      {
        number: 1,
        parent: { number: "2", title: "Bad parent" },
        subIssues: {
          nodes: [
            ref(30, { repo: "orgB/web" }),
            { title: "No number" },
            { number: "31" },
            { number: 0 },
            { number: 1.5 },
            ref(10, { repo: "orgA/core", title: "First" }),
            ref(10, { repo: "orgA/core", title: "Later duplicate" }),
            ref(2, { repo: "orgA/core" }),
          ],
        },
      },
      "orgA/core",
    );

    expect(result.parent).toBeNull();
    expect(result.children.map((child) => `${child.repo}#${child.number}`)).toEqual([
      "orgA/core#2",
      "orgA/core#10",
      "orgB/web#30",
    ]);
    expect(
      result.children.find((child) => child.number === 10)?.title,
    ).toBe("Later duplicate");
  });

  test("caps children and dependencies at one connection page", () => {
    const many = Array.from({ length: 150 }, (_, index) => ref(index + 1));
    const sub = normalizeSubIssues(
      { number: 1, subIssues: { nodes: many } },
      "orgA/core",
    );
    expect(sub.children).toHaveLength(MAX_RELATIONS_PER_KIND);
    expect(sub.children[0]?.number).toBe(1);
    expect(sub.children.at(-1)?.number).toBe(MAX_RELATIONS_PER_KIND);

    const deps = normalizeDependencies(
      {
        number: 1,
        blockedBy: { nodes: many },
        blocking: { nodes: many },
      },
      "orgA/core",
    );
    expect(deps.blockedBy).toHaveLength(MAX_RELATIONS_PER_KIND);
    expect(deps.blocking).toHaveLength(MAX_RELATIONS_PER_KIND);
  });

  test("maps blocked-by and blocking edges with cross-repo targets", () => {
    const result = normalizeDependencies(
      {
        number: 1,
        blockedBy: {
          nodes: [
            ref(7, { repo: "orgB/platform", state: "CLOSED" }),
            ref(3, { repo: "orgA/core", state: "OPEN" }),
          ],
        },
        blocking: {
          nodes: [ref(11, { repo: "orgC/api", state: "OPEN" })],
        },
      },
      "orgA/core",
    );

    expect(result.blockedBy.map((item) => `${item.repo}#${item.number}:${item.state}`)).toEqual([
      "orgA/core#3:open",
      "orgB/platform#7:closed",
    ]);
    expect(result.blocking).toEqual([
      {
        repo: "orgC/api",
        number: 11,
        title: "Related 11",
        state: "open",
        url: "https://example.test/issues/11",
      },
    ]);
  });

  test("treats a missing list or node as empty", () => {
    expect(normalizeSubIssues(null, "orgA/core")).toEqual({
      parent: null,
      children: [],
    });
    expect(normalizeDependencies({ number: 1 }, "orgA/core")).toEqual({
      blockedBy: [],
      blocking: [],
    });
    expect(normalizeRelationList(undefined, "orgA/core")).toEqual([]);
  });
});

describe("relation queries", () => {
  test("uses the two dedicated queries in batches of 100", async () => {
    const calls: Array<{ query: string; ids: string[] }> = [];
    const graphql: GraphqlFn = async (query, variables) => {
      calls.push({ query, ids: (variables?.ids ?? []) as string[] });
      return { nodes: [] };
    };
    const ids = Array.from({ length: RELATION_BATCH_SIZE + 1 }, (_, i) => `n${i}`);

    await fetchSubIssueRelations(graphql, "orgA/core", ids);
    await fetchDependencyRelations(graphql, "orgA/core", ids);

    expect(calls.map((call) => call.query)).toEqual([
      SUB_ISSUES_QUERY,
      SUB_ISSUES_QUERY,
      DEPENDENCIES_QUERY,
      DEPENDENCIES_QUERY,
    ]);
    expect(calls[0]?.ids).toHaveLength(RELATION_BATCH_SIZE);
    expect(calls[1]?.ids).toHaveLength(1);
  });

  test("keys normalized edges by the source issue number", async () => {
    const graphql = routedGraphql({
      subNodes: [subNode(1, [ref(3)], ref(2))],
      dependencyNodes: [dependencyNode(1, [ref(4)], [ref(5)])],
    });

    const sub = await fetchSubIssueRelations(graphql, "orgA/core", ["n1"]);
    const deps = await fetchDependencyRelations(graphql, "orgA/core", ["n1"]);

    expect(sub.get(1)?.parent?.number).toBe(2);
    expect(sub.get(1)?.children.map((child) => child.number)).toEqual([3]);
    expect(deps.get(1)?.blockedBy.map((item) => item.number)).toEqual([4]);
    expect(deps.get(1)?.blocking.map((item) => item.number)).toEqual([5]);
  });
});

describe("hydrateAndStore relation isolation", () => {
  test("a failed sub-issue query keeps prior sub-issue rows and still stores the issue", async () => {
    await hydrateAndStore(
      1,
      repo.id,
      ["n1"],
      routedGraphql({
        subNodes: [subNode(1, [ref(3)], ref(2))],
        dependencyNodes: [dependencyNode(1, [ref(4)], [])],
      }),
      { notificationsEnabled: () => false },
    );
    expect(mirror.getIssueRelations(repo.id, 1)).toHaveLength(3);

    await hydrateAndStore(
      1,
      repo.id,
      ["n1"],
      routedGraphql({
        subError: true,
        dependencyNodes: [dependencyNode(1, [], [])],
      }),
      { notificationsEnabled: () => false },
    );

    expect(mirror.getIssue(repo.id, 1)?.title).toBe("Source issue");
    const kinds = mirror
      .getIssueRelations(repo.id, 1)
      .map((edge) => `${edge.kind}:${edge.targetNumber}`)
      .sort();
    expect(kinds).toEqual(["child:3", "parent:2"]);
  });

  test("a failed dependency query keeps prior dependency rows", async () => {
    await hydrateAndStore(
      1,
      repo.id,
      ["n1"],
      routedGraphql({
        subNodes: [subNode(1, [ref(3)], ref(2))],
        dependencyNodes: [dependencyNode(1, [ref(4)], [ref(5)])],
      }),
      { notificationsEnabled: () => false },
    );

    await hydrateAndStore(
      1,
      repo.id,
      ["n1"],
      routedGraphql({
        subNodes: [subNode(1, [], null)],
        dependencyError: true,
      }),
      { notificationsEnabled: () => false },
    );

    expect(mirror.getIssue(repo.id, 1)?.title).toBe("Source issue");
    const kinds = mirror
      .getIssueRelations(repo.id, 1)
      .map((edge) => `${edge.kind}:${edge.targetNumber}`)
      .sort();
    expect(kinds).toEqual(["blocked_by:4", "blocking:5"]);
  });

  test("both queries may fail without losing the issue or either prior set", async () => {
    await hydrateAndStore(
      1,
      repo.id,
      ["n1"],
      routedGraphql({
        subNodes: [subNode(1, [ref(3)], ref(2))],
        dependencyNodes: [dependencyNode(1, [ref(4)], [ref(5)])],
      }),
      { notificationsEnabled: () => false },
    );

    await hydrateAndStore(
      1,
      repo.id,
      ["n1"],
      routedGraphql({ subError: true, dependencyError: true }),
      { notificationsEnabled: () => false },
    );

    expect(mirror.getIssue(repo.id, 1)?.title).toBe("Source issue");
    expect(mirror.getIssueRelations(repo.id, 1)).toHaveLength(4);
  });
});

describe("relation storage", () => {
  test("replacing one relation set leaves the other set intact", () => {
    mirror.replaceIssueSubIssueRelations(repo.id, 1, ref(2), [ref(3), ref(4)]);
    mirror.replaceIssueDependencyRelations(repo.id, 1, [ref(5)], [ref(6)]);

    mirror.replaceIssueSubIssueRelations(repo.id, 1, ref(7), [ref(8)]);

    const afterSub = mirror
      .getIssueRelations(repo.id, 1)
      .map((edge) => `${edge.kind}:${edge.targetNumber}`)
      .sort();
    expect(afterSub).toEqual([
      "blocked_by:5",
      "blocking:6",
      "child:8",
      "parent:7",
    ]);

    mirror.replaceIssueDependencyRelations(repo.id, 1, [], [ref(9)]);

    const afterDeps = mirror
      .getIssueRelations(repo.id, 1)
      .map((edge) => `${edge.kind}:${edge.targetNumber}`)
      .sort();
    expect(afterDeps).toEqual(["blocking:9", "child:8", "parent:7"]);
  });

  test("updates snapshot fields when an edge key is unchanged", () => {
    mirror.replaceIssueSubIssueRelations(repo.id, 1, null, [
      ref(3, { title: "Child issue", state: "OPEN" }),
    ]);
    mirror.replaceIssueSubIssueRelations(repo.id, 1, null, [
      ref(3, { title: "Child issue renamed", state: "closed" }),
    ]);

    expect(mirror.getIssueRelations(repo.id, 1)).toMatchObject([
      {
        kind: "child",
        targetNumber: 3,
        targetTitle: "Child issue renamed",
        targetState: "closed",
      },
    ]);
  });

  test("deleteIssue removes only the deleted source issue's relation rows", () => {
    seedIssue(1);
    seedIssue(2);
    mirror.replaceIssueSubIssueRelations(repo.id, 1, ref(10), [ref(11)]);
    mirror.replaceIssueDependencyRelations(repo.id, 1, [ref(12)], []);
    mirror.replaceIssueSubIssueRelations(repo.id, 2, ref(20), [ref(21)]);

    mirror.deleteIssue(repo.id, 1);

    expect(mirror.getIssueRelations(repo.id, 1)).toEqual([]);
    expect(
      mirror
        .getIssueRelations(repo.id, 2)
        .map((edge) => `${edge.kind}:${edge.targetNumber}`)
        .sort(),
    ).toEqual(["child:21", "parent:20"]);
  });
});

describe("getIssueDetail relations", () => {
  test("maps parent, children, progress and dependencies", () => {
    seedIssue(1);
    mirror.replaceIssueSubIssueRelations(repo.id, 1, ref(2), [
      ref(4, { state: "CLOSED" }),
      ref(3, { state: "OPEN" }),
      ref(5, { state: "CLOSED", repo: "orgB/web" }),
    ]);
    mirror.replaceIssueDependencyRelations(
      repo.id,
      1,
      [ref(6, { state: "OPEN" })],
      [ref(8, { state: "CLOSED" }), ref(7, { state: "OPEN" })],
    );

    const relations = getIssueDetail(repo.id, 1)?.relations;
    expect(relations?.parent).toMatchObject({ repo: "orgA/core", number: 2 });
    expect(
      relations?.children.map((child) => `${child.repo}#${child.number}`),
    ).toEqual(["orgA/core#3", "orgA/core#4", "orgB/web#5"]);
    expect(relations?.progress).toEqual({
      total: 3,
      completed: 2,
      percent: 67,
    });
    expect(
      relations?.blockedBy.map((item) => item.number),
    ).toEqual([6]);
    expect(
      relations?.blocking.map((item) => `${item.number}:${item.state}`),
    ).toEqual(["7:open", "8:closed"]);
  });

  test("returns empty relations and null progress when there are none", () => {
    seedIssue(2);
    expect(getIssueDetail(repo.id, 2)?.relations).toEqual({
      parent: null,
      children: [],
      blockedBy: [],
      blocking: [],
      progress: null,
    });
  });

  test("computes 0 and 100 percent boundaries", () => {
    seedIssue(3);
    seedIssue(4);
    mirror.replaceIssueSubIssueRelations(repo.id, 3, null, [
      ref(30, { state: "OPEN" }),
      ref(31, { state: "OPEN" }),
    ]);
    mirror.replaceIssueSubIssueRelations(repo.id, 4, null, [
      ref(40, { state: "CLOSED" }),
      ref(41, { state: "CLOSED" }),
    ]);

    expect(getIssueDetail(repo.id, 3)?.relations.progress).toEqual({
      total: 2,
      completed: 0,
      percent: 0,
    });
    expect(getIssueDetail(repo.id, 4)?.relations.progress).toEqual({
      total: 2,
      completed: 2,
      percent: 100,
    });
  });
});
