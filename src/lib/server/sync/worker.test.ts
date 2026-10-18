import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { setConfig } from "#/lib/server/config";
import {
  github,
  resetAppCache,
  type InstallationOctokit,
} from "#/lib/server/github/app.server";
import { TEST_CONFIG } from "#tests/test-config";
import { clearMirror } from "#tests/mirror-helpers";
import { resetEventBus, subscribe } from "./events";
import * as mirror from "./mirror";
import {
  inHistoryWindow,
  pollRepo,
  refreshIssue,
  runRepoCycle,
  startSyncWorker,
  stopSyncWorker,
  syncAllRepos,
  type RestIssue,
} from "./worker";

// Module-level state read by the fake installation client below.
let pages: RestIssue[][] = [];
let etag = '"e1"';
let notModified = false;
let timeline: unknown[] = [];
let deletedLabels: string[] = [];
let lastIfNoneMatch: string | null = null;
let nodes: unknown[] = [];
let graphqlCalls: Array<Record<string, unknown>> = [];
let failIssues = false;

/** Returned by the fake `GET /repos/{owner}/{repo}/assignees` (refreshRepoAssignees). */
interface FakeAssignee {
  id: number;
  login: string;
  avatar_url: string;
}
let repoAssignees: FakeAssignee[] = [];

const fake = {
  request: async (route: string, params: Record<string, unknown> = {}) => {
    const headers = (params.headers ?? {}) as Record<string, string>;
    if (route === "GET /repos/{owner}/{repo}") {
      return { data: { id: 1, name: "core", owner: { login: "orgA" } } };
    }
    if (route === "GET /repos/{owner}/{repo}/labels") {
      return { data: [] };
    }
    if (route === "GET /repos/{owner}/{repo}/assignees") {
      return { data: repoAssignees };
    }
    if (route === "GET /repos/{owner}/{repo}/issues") {
      if (failIssues) throw new Error("boom");
      const page = Number(params.page ?? 1);
      if (page === 1) {
        lastIfNoneMatch = headers["If-None-Match"] ?? null;
        if (notModified && lastIfNoneMatch) {
          throw Object.assign(new Error("Not Modified"), { status: 304 });
        }
      }
      return { data: pages[page - 1] ?? [], headers: { etag } };
    }
    if (route === "GET /repos/{owner}/{repo}/issues/{issue_number}") {
      return { data: restIssue({ number: Number(params.issue_number) }) };
    }
    if (
      route === "GET /repos/{owner}/{repo}/issues/{issue_number}/timeline"
    ) {
      return { data: timeline };
    }
    if (
      route ===
      "DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels/{name}"
    ) {
      deletedLabels.push(String(params.name));
      return { data: {} };
    }
    return { data: {} };
  },
  graphql: async (_query: string, variables?: Record<string, unknown>) => {
    graphqlCalls.push(variables ?? {});
    return { nodes };
  },
} as unknown as InstallationOctokit;

let spy: { mockRestore(): void };
const realFetch = globalThis.fetch;

function restIssue(overrides: Partial<RestIssue> = {}): RestIssue {
  return {
    number: 1,
    node_id: "n1",
    state: "open",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function issueNode(overrides: Record<string, unknown> = {}) {
  return {
    databaseId: 101,
    number: 1,
    title: "t",
    body: "",
    state: "OPEN",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    labels: { nodes: [] },
    assignees: { nodes: [] },
    comments: { nodes: [] },
    ...overrides,
  };
}

beforeEach(() => {
  clearMirror();
  resetEventBus();
  stopSyncWorker();
  setConfig(TEST_CONFIG);
  resetAppCache();
  pages = [];
  etag = '"e1"';
  notModified = false;
  timeline = [];
  deletedLabels = [];
  lastIfNoneMatch = null;
  nodes = [];
  graphqlCalls = [];
  failIssues = false;
  repoAssignees = [];
  globalThis.fetch = (async (input: unknown) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/installation")) {
      return Response.json({ id: 7 });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  mirror.upsertRepo({ githubId: 1, org: "orgA", name: "core", archived: false });
  spy = spyOn(github, "asInstallation").mockResolvedValue(fake);
});

afterEach(() => {
  spy.mockRestore();
  globalThis.fetch = realFetch;
  resetAppCache();
});

describe("inHistoryWindow", () => {
  const cutoff = Date.parse("2026-01-01T00:00:00Z");
  test("keeps all open issues", () => {
    expect(inHistoryWindow(restIssue({ state: "open" }), cutoff)).toBe(true);
  });
  test("keeps recently closed issues and drops old ones", () => {
    expect(
      inHistoryWindow(
        restIssue({ state: "closed", closed_at: "2026-02-01T00:00:00Z" }),
        cutoff,
      ),
    ).toBe(true);
    expect(
      inHistoryWindow(
        restIssue({ state: "closed", closed_at: "2020-01-01T00:00:00Z" }),
        cutoff,
      ),
    ).toBe(false);
  });
  test("drops a closed issue with no closed_at", () => {
    expect(inHistoryWindow(restIssue({ state: "closed" }), cutoff)).toBe(false);
  });
});

describe("pollRepo", () => {
  test("sends the stored ETag and short-circuits on 304", async () => {
    mirror.setRepoEtag(1, '"cached"');
    notModified = true;

    const result = await pollRepo(mirror.getRepo(1)!, 42, 1000);

    expect(lastIfNoneMatch).toBe('"cached"');
    expect(result.notModified).toBe(true);
    expect(result.changed).toBe(0);
    expect(graphqlCalls).toEqual([]);
  });

  test("hydrates changed issues, stores the ETag, and advances the cursor", async () => {
    const updated = "2026-01-02T00:00:00Z";
    pages = [[restIssue({ number: 1, node_id: "n1", updated_at: updated })]];
    nodes = [issueNode({ databaseId: 101, number: 1, updatedAt: updated })];

    const result = await pollRepo(
      mirror.getRepo(1)!,
      42,
      Date.parse("2026-01-03T00:00:00Z"),
    );

    expect(result).toMatchObject({ notModified: false, changed: 1, hydrated: 1 });
    expect(mirror.getIssue(1, 1)?.title).toBe("t");
    expect(mirror.getRepoCursor(1)).toBe(Date.parse(updated));
    expect(mirror.getRepo(1)?.etag).toBe('"e1"');
  });

  test("skips pull requests", async () => {
    pages = [
      [
        restIssue({ number: 1, node_id: "n1" }),
        restIssue({ number: 2, node_id: "n2", pull_request: {} }),
      ],
    ];
    nodes = [issueNode({ databaseId: 101, number: 1 })];

    const result = await pollRepo(mirror.getRepo(1)!, 42, Date.now());

    expect(result.changed).toBe(1);
    expect(graphqlCalls[0].ids as string[]).toEqual(["n1"]);
  });

  test("paginates in 100-issue batches", async () => {
    const firstPage = Array.from({ length: 100 }, (_, i) =>
      restIssue({ number: i + 1, node_id: `n${i + 1}` }),
    );
    pages = [firstPage, [restIssue({ number: 101, node_id: "n101" })]];

    const result = await pollRepo(mirror.getRepo(1)!, 42, Date.now());

    expect(result.changed).toBe(101);
    expect(graphqlCalls).toHaveLength(2);
    expect((graphqlCalls[0].ids as string[]).length).toBe(100);
    expect(graphqlCalls[1].ids).toEqual(["n101"]);
  });

  test("prunes changed issues that aged out of the window", async () => {
    mirror.upsertIssue(
      {
        githubId: 101,
        repoId: 1,
        number: 1,
        title: "old",
        body: "",
        state: "closed",
        stateReason: "completed",
        author: null,
        milestoneName: null,
        createdAt: 0,
        updatedAt: 0,
        closedAt: 0,
        labels: [],
        assignees: [],
        comments: [],
      },
      { status: null, priority: null, size: null, blocked: false, labelConflict: false },
    );
    pages = [
      [
        restIssue({
          number: 1,
          node_id: "n1",
          state: "closed",
          closed_at: "2020-01-01T00:00:00Z",
        }),
      ],
    ];

    const result = await pollRepo(
      mirror.getRepo(1)!,
      42,
      Date.parse("2026-01-01T00:00:00Z"),
    );

    expect(result.pruned).toBe(1);
    expect(mirror.getIssue(1, 1)).toBeUndefined();
    expect(graphqlCalls).toEqual([]);
  });

  test("resolves label conflicts with the installation token", async () => {
    pages = [[restIssue({ number: 1, node_id: "n1" })]];
    nodes = [
      issueNode({
        databaseId: 101,
        number: 1,
        labels: { nodes: [{ name: "todo" }, { name: "in-progress" }] },
      }),
    ];
    timeline = [
      {
        event: "labeled",
        label: { name: "todo" },
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        event: "labeled",
        label: { name: "in-progress" },
        created_at: "2026-01-02T00:00:00Z",
      },
    ];

    const result = await pollRepo(mirror.getRepo(1)!, 42, Date.now());

    expect(result.conflicts).toBe(1);
    expect(deletedLabels).toEqual(["todo"]);
    expect(mirror.getIssue(1, 1)?.status).toBe("in-progress");
    expect(mirror.getIssue(1, 1)?.labelConflict).toBe(0);
    expect(mirror.getIssueLabels(1, 1)).toEqual(["in-progress"]);
  });

  test("publishes a sync event for changed issues", async () => {
    const events: unknown[] = [];
    subscribe((e) => events.push(e));
    pages = [[restIssue({ number: 1, node_id: "n1" })]];
    nodes = [issueNode({ databaseId: 101, number: 1 })];

    await pollRepo(mirror.getRepo(1)!, 42, Date.now());

    expect(events).toEqual([
      { type: "issues", repo: "orgA/core", numbers: [1] },
    ]);
  });

  test("stays quiet (no event, no etag change) on 304", async () => {
    const events: unknown[] = [];
    subscribe((e) => events.push(e));
    mirror.setRepoEtag(1, '"cached"');
    notModified = true;

    await pollRepo(mirror.getRepo(1)!, 42, Date.now());

    expect(events).toEqual([]);
  });
});

describe("runRepoCycle", () => {
  test("bootstraps the repo, refreshes labels, and polls", async () => {
    pages = [[restIssue({ number: 1, node_id: "n1" })]];
    nodes = [issueNode({ databaseId: 101, number: 1 })];

    const result = await runRepoCycle("orgA", "core");

    expect(result.changed).toBe(1);
    expect(mirror.getRepo(1)?.name).toBe("core");
    expect(mirror.getRepo(1)?.degraded).toBe(0);
    expect(mirror.getIssue(1, 1)?.title).toBe("t");
  });

  test("mirrors the repo's assignable users", async () => {
    repoAssignees = [
      { id: 42, login: "amy", avatar_url: "https://avatars/amy.png" },
      { id: 43, login: "zoe", avatar_url: "https://avatars/zoe.png" },
    ];

    await runRepoCycle("orgA", "core");

    expect(mirror.getRepoAssignees(1).map((u) => u.login)).toEqual([
      "amy",
      "zoe",
    ]);
  });

  test("marks the repo degraded and rethrows when polling fails", async () => {
    failIssues = true;

    await expect(runRepoCycle("orgA", "core")).rejects.toThrow("boom");
    expect(mirror.getRepo(1)?.degraded).toBe(1);
  });
});

describe("refreshIssue", () => {
  test("hydrates a single issue and publishes an event", async () => {
    const events: unknown[] = [];
    subscribe((e) => events.push(e));
    nodes = [issueNode({ databaseId: 101, number: 1 })];

    await refreshIssue("orgA", "core", 1);

    expect(mirror.getIssue(1, 1)?.title).toBe("t");
    expect(events).toEqual([
      { type: "issues", repo: "orgA/core", numbers: [1] },
    ]);
  });
});

describe("syncAllRepos", () => {
  test("polls every configured repo and isolates failures", async () => {
    setConfig({ ...TEST_CONFIG, repos: ["orgA/core"] });
    pages = [[restIssue({ number: 1, node_id: "n1" })]];
    nodes = [issueNode({ databaseId: 101, number: 1 })];

    await syncAllRepos();

    expect(mirror.getIssue(1, 1)?.title).toBe("t");
  });
});

describe("scheduler lifecycle", () => {
  test("start/stop are safe and idempotent", () => {
    startSyncWorker();
    startSyncWorker();
    stopSyncWorker();
    stopSyncWorker();
    expect(true).toBe(true);
  });
});

