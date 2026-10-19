import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { setConfig } from "#/lib/server/config";
import {
  github,
  resetAppCache,
  type InstallationOctokit,
} from "#/lib/server/github/app.server";
import { TEST_CONFIG } from "#tests/test-config";
import { clearMirror } from "#tests/mirror-helpers";
import * as mirror from "./mirror";
import { msUntilNextRun, reconcileRepo, runReconciliation } from "./reconcile";

const realFetch = globalThis.fetch;

// The fake installation client only answers the routes reconcileRepo touches.
const fake = {
  request: async (route: string, params: Record<string, unknown> = {}) => {
    if (route === "GET /repos/{owner}/{repo}") {
      return { data: { id: 1, name: "core", owner: { login: "recon" } } };
    }
    if (route === "GET /repos/{owner}/{repo}/issues") {
      // Full sweep: one live issue. Anything else mirrored is obsolete.
      return {
        data: [
          {
            number: 1,
            node_id: "n1",
            state: "open",
            updated_at: "2026-01-01T00:00:00Z",
          },
        ],
        headers: { etag: '"e"' },
      };
    }
    if (route === "GET /repos/{owner}/{repo}/labels") {
      return { data: [] };
    }
    if (route === "GET /repos/{owner}/{repo}/milestones") {
      return { data: [] };
    }
    if (route === "GET /repos/{owner}/{repo}/issues/{issue_number}/timeline") {
      return { data: [] };
    }
    return { data: params };
  },
  graphql: async () => ({
    nodes: [
      {
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
      },
    ],
  }),
} as unknown as InstallationOctokit;

let spy: { mockRestore(): void };

beforeEach(() => {
  clearMirror();
  setConfig(TEST_CONFIG);
  resetAppCache();
  globalThis.fetch = (async (input: unknown) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/installation")) {
      if (url.pathname.startsWith("/repos/ghost/")) {
        return Response.json({ message: "Not Found" }, { status: 404 });
      }
      return Response.json({ id: 7 });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  spy = spyOn(github, "asInstallation").mockResolvedValue(fake);
});

afterEach(() => {
  spy.mockRestore();
  globalThis.fetch = realFetch;
  resetAppCache();
});

function seedStaleIssue() {
  mirror.upsertRepo({ githubId: 1, org: "recon", name: "core", archived: false });
  mirror.upsertIssue(
    {
      githubId: 999,
      repoId: 1,
      number: 999,
      title: "deleted upstream",
      body: "",
      state: "open",
      stateReason: null,
      author: null,
      milestoneNumber: null,
      createdAt: 0,
      updatedAt: 0,
      closedAt: null,
      labels: [],
      assignees: [],
      comments: [],
    },
    { status: null, size: null, blocked: false, labelConflict: false },
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
    expect(mirror.getIssue(1, 999)).toBeUndefined();
    expect(mirror.getIssue(1, 1)?.title).toBe("live");
    expect(mirror.getRepo(1)?.lastReconciledAt).not.toBeNull();
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
