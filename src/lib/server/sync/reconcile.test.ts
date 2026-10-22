import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import type { ForgeEvent, Thread } from "forges";
import { setConfig } from "#/lib/server/config";
import { forge } from "#/lib/server/forge/providers.server";
import { TEST_CONFIG } from "#tests/test-config";
import { clearMirror } from "#tests/mirror-helpers";
import * as mirror from "./mirror";
import { msUntilNextRun, reconcileRepo, runReconciliation } from "./reconcile";

const realFetch = globalThis.fetch;

function iterable<T>(items: readonly T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      yield* items;
    },
  };
}

const liveThread = {
  ref: {
    forge: "github",
    instance: "github.com",
    repo: {
      forge: "github",
      instance: "github.com",
      owner: "recon",
      name: "core",
    },
    kind: "issue",
    number: "1",
    externalId: "n1",
  },
  kind: "issue",
  title: "live",
  state: "open",
  isDraft: false,
  assignees: [],
  reviewers: [],
  labels: [],
  updatedAt: new Date("2026-01-01T00:00:00Z"),
} as unknown as Thread;

const liveNode = {
  databaseId: 101,
  number: 1,
  title: "live",
  body: "",
  state: "OPEN",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  labels: { nodes: [] },
  assignees: { nodes: [] },
  comments: { nodes: [] },
};

// The fake installation provider only answers the calls reconcileRepo makes.
const fakeProvider = {
  request: async (_method: string, path: string) => {
    if (path.endsWith("/milestones")) return { data: [] };
    return { data: {} };
  },
  graphql: async () => ({ nodes: [liveNode] }),
  repos: {
    get: async () => ({
      ref: {
        forge: "github",
        instance: "github.com",
        owner: "recon",
        name: "core",
        externalId: "1",
      },
      isArchived: false,
    }),
    labels: () => iterable([]),
    createLabel: async (
      _ref: unknown,
      input: { name: string; colour?: string; description?: string },
    ) => ({
      name: input.name,
      color: input.colour ?? "",
      description: input.description ?? "",
    }),
  },
  threads: {
    list: () => ({
      page: async () => ({ items: [liveThread], etag: '"e"' }),
    }),
    events: () => iterable([] as ForgeEvent[]),
  },
};

let spy: { mockRestore(): void };

beforeEach(() => {
  clearMirror();
  setConfig(TEST_CONFIG);
  forge.resetCaches();
  globalThis.fetch = (async (
    input: unknown,
    init?: { method?: string; body?: unknown },
  ) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/installation")) {
      if (url.pathname.startsWith("/repos/ghost/")) {
        return Response.json({ message: "Not Found" }, { status: 404 });
      }
      return Response.json({ id: 7 });
    }
    // Label provisioning now runs through a `forges` provider: list and
    // create both hit the same route.
    if (url.pathname.endsWith("/labels")) {
      if ((init?.method ?? "GET").toUpperCase() === "GET") {
        return Response.json([]);
      }
      return Response.json(JSON.parse(String(init?.body ?? "{}")));
    }
    if (url.pathname.endsWith("/milestones")) {
      return Response.json([]);
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  spy = spyOn(forge, "installationProvider").mockResolvedValue(
    fakeProvider as never,
  );
});

afterEach(() => {
  spy.mockRestore();
  globalThis.fetch = realFetch;
  forge.resetCaches();
});

let seededRepoId = 0;

function seedStaleIssue() {
  const repo = mirror.upsertRepo({
    externalId: "1",
    forge: "github",
    instance: "github.com",
    org: "recon",
    name: "core",
    url: "https://github.com/recon/core",
    archived: false,
  });
  seededRepoId = repo.id;
  mirror.upsertIssue(
    {
      externalId: "999",
      repoId: repo.id,
      number: 999,
      kind: "issue",
      title: "deleted upstream",
      body: "",
      state: "open",
      stateReason: null,
      author: null,
      milestoneNumber: null,
      url: "https://github.com/recon/core/issues/999",
      createdAt: 0,
      updatedAt: 0,
      closedAt: null,
      labels: [],
      assignees: [],
      comments: [],
    },
    { status: null, priority: null, size: null, blocked: false, labelConflict: false },
  );
}

describe("msUntilNextRun", () => {
  test("is positive and within a day", () => {
    const delay = msUntilNextRun(new Date("2026-01-01T12:00:00"));
    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  test("rolls to the next day when the hour has passed", () => {
    const atMidnight = msUntilNextRun(new Date("2026-01-01T00:00:00"));
    const afterHour = msUntilNextRun(new Date("2026-01-01T04:00:00"));
    expect(atMidnight).toBe(3 * 60 * 60 * 1000);
    expect(afterHour).toBe(23 * 60 * 60 * 1000);
  });
});

describe("reconcileRepo", () => {
  test("prunes obsolete issues, hydrates live ones, and re-provisions labels", async () => {
    seedStaleIssue();

    const result = await reconcileRepo("recon", "core");

    expect(result.pruned).toBe(1);
    expect(result.hydrated).toBe(1);
    expect(result.labels?.created.length).toBeGreaterThan(0);
    expect(mirror.getIssue(seededRepoId, 999)).toBeUndefined();
    expect(mirror.getIssue(seededRepoId, 1)?.title).toBe("live");
    expect(mirror.getRepo(seededRepoId)?.lastReconciledAt).not.toBeNull();
  });
});

describe("runReconciliation", () => {
  test("isolates a failing repo and still reports the others", async () => {
    setConfig({
      ...TEST_CONFIG,
      repos: [
        { repo: "recon/core", shortcode: "RECON" },
        { repo: "ghost/nope", shortcode: "GHOST" },
      ],
    });
    seedStaleIssue();

    const report = await runReconciliation();

    expect(report.failed).toBe(1);
    const bad = report.repos.find((r) => r.repo === "ghost/nope");
    expect(bad?.error).toContain("404");
    const good = report.repos.find((r) => r.repo === "recon/core");
    expect(good?.pruned).toBe(1);
  });
});
