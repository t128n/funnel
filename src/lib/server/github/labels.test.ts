import {
  afterEach,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetConfigCache, setConfig, type FunnelConfig } from "#/lib/server/config";
import { TEST_CONFIG } from "#tests/test-config";
import { github, resetAppCache, type InstallationOctokit } from "./app.server";
import {
  CANONICAL_LABELS,
  provisionCanonicalLabels,
  provisionRepoLabels,
} from "./labels";

const realFetch = globalThis.fetch;

interface SeenRequest {
  route: string;
  page: string | null;
  body: Record<string, unknown> | null;
}

let seen: SeenRequest[] = [];
/** Pages of `GET /labels` responses; index 0 is page 1. */
let labelPages: unknown[][] = [[]];
let asInstallation: {
  mockResolvedValue(value: InstallationOctokit): void;
  mockRestore(): void;
};

/** Canonical labels as GitHub would echo them (uppercase hex, some nulls). */
function canonicalJson(): Array<{
  name: string;
  color: string;
  description: string;
}> {
  return CANONICAL_LABELS.map((l) => ({
    name: l.name,
    color: l.color.toUpperCase(),
    description: l.description,
  }));
}

/**
 * A fake installation-scoped client, mirroring `api-passthrough.test.ts`.
 * Injecting it (via {@link asInstallation}) bypasses the real App token mint
 * and, crucially, octokit's throttling plugin, which rate-limits *writes* to
 * one per second and would otherwise make these tests crawl.
 */
function fakeInstallation(): InstallationOctokit {
  return {
    request: async (route: string, params: Record<string, unknown> = {}) => {
      seen.push({
        route,
        page: params.page != null ? String(params.page) : null,
        body: params,
      });
      if (route === "GET /repos/{owner}/{repo}/labels") {
        const page = Number(params.page ?? 1);
        return { data: labelPages[page - 1] ?? [] };
      }
      return { data: params };
    },
  } as unknown as InstallationOctokit;
}

/** Only the App-JWT installation lookup reaches the network. */
function installInstallationFetch(): void {
  globalThis.fetch = (async (input: unknown) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/installation")) {
      if (url.pathname.startsWith("/repos/bad/")) {
        return new Response("{}", { status: 404 });
      }
      return Response.json({ id: 777 });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
}

const writes = () =>
  seen.filter(
    (s) =>
      s.route === "POST /repos/{owner}/{repo}/labels" ||
      s.route === "PATCH /repos/{owner}/{repo}/labels/{name}",
  );

beforeEach(() => {
  seen = [];
  labelPages = [[]];
  setConfig(TEST_CONFIG);
  resetAppCache();
  installInstallationFetch();
  asInstallation = spyOn(github, "asInstallation").mockResolvedValue(
    fakeInstallation(),
  );
});

afterEach(() => {
  asInstallation.mockRestore();
  globalThis.fetch = realFetch;
  resetAppCache();
});

describe("CANONICAL_LABELS", () => {
  test("matches the SPEC §5.1 vocabulary exactly", () => {
    expect(CANONICAL_LABELS.map((l) => l.name)).toEqual([
      "backlog",
      "todo",
      "in-progress",
      "in-review",
      "blocked",
      "p1",
      "p2",
      "p3",
      "sm",
      "md",
      "lg",
    ]);
    for (const label of CANONICAL_LABELS) {
      expect(label.color).toMatch(/^[0-9a-fA-F]{6}$/);
      expect(label.description.length).toBeGreaterThan(0);
    }
  });
});

describe("provisionRepoLabels", () => {
  test("creates every canonical label when the repo has none", async () => {
    const summary = await provisionRepoLabels("orgA", "core");

    expect(summary.created).toEqual(CANONICAL_LABELS.map((l) => l.name));
    expect(summary.updated).toEqual([]);
    expect(summary.unchanged).toEqual([]);

    const posts = writes();
    expect(posts.length).toBe(CANONICAL_LABELS.length);
    const progress = posts.find((s) => s.body?.name === "in-progress");
    expect(progress?.body).toMatchObject({
      owner: "orgA",
      repo: "core",
      name: "in-progress",
      color: "33b1ff",
      description: "Status: In Progress",
    });
  });

  test("is a no-op when everything already matches (case-insensitive)", async () => {
    labelPages = [
      [...canonicalJson(), { name: "bug", color: "000000", description: "" }],
    ];

    const summary = await provisionRepoLabels("orgA", "core");

    expect(summary.created).toEqual([]);
    expect(summary.updated).toEqual([]);
    expect(summary.unchanged).toEqual(CANONICAL_LABELS.map((l) => l.name));
    expect(writes()).toEqual([]);
  });

  test("patches drifted color and description, leaving others alone", async () => {
    const labels = canonicalJson().map((l) => {
      if (l.name === "p1") return { ...l, color: "000000" };
      if (l.name === "sm") return { ...l, description: "stale" };
      return l;
    });
    labels.push({ name: "bug", color: "123456", description: "keep me" });
    labelPages = [labels];

    const summary = await provisionRepoLabels("orgA", "core");

    expect(summary.created).toEqual([]);
    expect(summary.updated).toEqual(["p1", "sm"]);
    expect(summary.unchanged).toHaveLength(9);

    const patches = seen.filter(
      (s) => s.route === "PATCH /repos/{owner}/{repo}/labels/{name}",
    );
    expect(patches.map((p) => p.body?.name)).toEqual(["p1", "sm"]);
    // The non-reserved `bug` label is never touched.
    expect(writes().some((w) => w.body?.name === "bug")).toBe(false);
  });

  test("treats a null description as drift", async () => {
    labelPages = [
      canonicalJson().map((l) =>
        l.name === "md" ? { ...l, description: null } : l,
      ),
    ];

    const summary = await provisionRepoLabels("orgA", "core");

    expect(summary.updated).toEqual(["md"]);
  });

  test("paginates until a short page and finds labels on later pages", async () => {
    const junk = Array.from({ length: 100 }, (_, i) => ({
      name: `junk-${i}`,
      color: "000000",
      description: "",
    }));
    labelPages = [junk, canonicalJson()];

    const summary = await provisionRepoLabels("orgA", "core");

    expect(summary.created).toEqual([]);
    expect(summary.unchanged).toHaveLength(CANONICAL_LABELS.length);
    const listCalls = seen.filter(
      (s) => s.route === "GET /repos/{owner}/{repo}/labels",
    );
    expect(listCalls.map((c) => c.page)).toEqual(["1", "2"]);
  });

  test("rejects when the App is not installed on the repo", async () => {
    await expect(provisionRepoLabels("bad", "core")).rejects.toMatchObject({
      status: 404,
    });
  });

  test("uses the real installation client (App token) end to end", async () => {
    asInstallation.mockRestore();
    const requests: string[] = [];
    globalThis.fetch = (async (
      input: unknown,
      init?: { method?: string },
    ) => {
      const url = new URL(String(input));
      requests.push(`${init?.method ?? "GET"} ${url.pathname}`);
      if (url.pathname.endsWith("/installation")) {
        return Response.json({ id: 777 });
      }
      if (url.pathname.endsWith("/access_tokens")) {
        return Response.json({
          token: "ghs_test",
          expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        });
      }
      if ((init?.method ?? "GET").toUpperCase() === "GET") {
        return Response.json([]);
      }
      return Response.json({});
    }) as typeof fetch;

    // A one-label subset keeps the run under octokit's 1s/write throttle.
    const summary = await provisionRepoLabels("orgA", "core", [
      CANONICAL_LABELS[0],
    ]);

    expect(summary.created).toEqual(["backlog"]);
    expect(requests).toContain(
      "POST /app/installations/777/access_tokens",
    );
  });
});

describe("provisionCanonicalLabels", () => {
  test("provisions every configured repo and aggregates the report", async () => {
    setConfig({ ...TEST_CONFIG, repos: ["orgA/core", "orgA/web"] });

    const report = await provisionCanonicalLabels();

    expect(report.failed).toBe(0);
    expect(report.repos.map((r) => r.repo)).toEqual(["orgA/core", "orgA/web"]);
    expect(report.created).toBe(CANONICAL_LABELS.length * 2);
    expect(report.updated).toBe(0);
  });

  test("isolates a failing repo so the others still reconcile", async () => {
    const config: FunnelConfig = {
      ...TEST_CONFIG,
      repos: ["good/core", "bad/core"],
    };
    setConfig(config);

    const report = await provisionCanonicalLabels();

    expect(report.failed).toBe(1);
    const good = report.repos.find((r) => r.repo === "good/core");
    expect(good?.summary?.created).toHaveLength(CANONICAL_LABELS.length);
    const bad = report.repos.find((r) => r.repo === "bad/core");
    expect(bad?.error).toContain("404");
  });

  test("resolves with an empty report when config cannot be loaded", async () => {
    // A real `funnel.config.yaml` may exist in the repo root, so run from an
    // empty directory to force `getConfig()` to fail deterministically.
    const originalCwd = process.cwd();
    const emptyDir = mkdtempSync(join(tmpdir(), "funnel-no-config-"));
    try {
      process.chdir(emptyDir);
      resetConfigCache();
      const report = await provisionCanonicalLabels();
      expect(report).toEqual({ repos: [], created: 0, updated: 0, failed: 0 });
    } finally {
      process.chdir(originalCwd);
      resetConfigCache();
    }
  });
});
