import {
  afterEach,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from "bun:test";
import { ForgeApiError } from "forges";
import {
  resetConfigCache,
  setConfig,
  type FunnelConfig,
} from "#/lib/server/config";
import { clearSettings, writeSettings } from "#/lib/server/settings/store";
import { forge } from "#/lib/server/forge/providers.server";
import { TEST_CONFIG } from "#tests/test-config";
import { captureLog, type LogCapture } from "#tests/log-capture";
import {
  CANONICAL_LABELS,
  provisionCanonicalLabels,
  provisionRepoLabels,
} from "./labels";

interface FakeLabel {
  name: string;
  colour?: string;
  description?: string;
}

interface SeenCall {
  method: string;
  path: string;
  body?: unknown;
}

const calls: SeenCall[] = [];
let existing: FakeLabel[] = [];

/** A fake `GitHubProvider` covering only the label operations labels.ts uses. */
function fakeProvider() {
  return {
    repos: {
      labels: (_ref: unknown) => ({
        async *[Symbol.asyncIterator]() {
          for (const label of existing) yield label;
        },
      }),
      createLabel: async (
        _ref: unknown,
        input: { name: string; colour?: string; description?: string },
      ) => {
        calls.push({
          method: "POST",
          path: "labels",
          body: {
            name: input.name,
            colour: input.colour,
            description: input.description,
          },
        });
        return input;
      },
    },
    request: async (
      method: string,
      path: string,
      options?: { body?: unknown },
    ) => {
      calls.push({ method, path, body: options?.body });
      return { status: 200, data: {}, headers: new Headers() };
    },
  };
}

let providerSpy: ReturnType<typeof spyOn>;
let idSpy: ReturnType<typeof spyOn>;
let logs: LogCapture;

beforeEach(() => {
  calls.length = 0;
  existing = [];
  setConfig(TEST_CONFIG);
  providerSpy = spyOn(forge, "installationProvider").mockResolvedValue(
    fakeProvider() as never,
  );
  idSpy = spyOn(forge, "getInstallationId").mockResolvedValue(777);
  logs = captureLog();
});

afterEach(() => {
  providerSpy.mockRestore();
  idSpy.mockRestore();
  logs.reset();
});

describe("CANONICAL_LABELS", () => {
  test("matches the SPEC §5.1 vocabulary exactly", () => {
    expect(CANONICAL_LABELS.map((l) => l.name)).toEqual([
      "backlog",
      "todo",
      "in-progress",
      "in-review",
      "blocked",
      "sev",
      "mod",
      "min",
      "high",
      "mid",
      "low",
      "sm",
      "md",
      "lg",
      "epic",
    ]);
    for (const label of CANONICAL_LABELS) {
      expect(label.color).toMatch(/^[0-9a-fA-F]{6}$/);
      expect(label.description.length).toBeGreaterThan(0);
    }
  });
});

describe("provisionRepoLabels", () => {
  test("creates every missing canonical label", async () => {
    const summary = await provisionRepoLabels("acme", "widgets");

    expect(summary.created).toEqual(CANONICAL_LABELS.map((l) => l.name));
    expect(summary.updated).toEqual([]);
    expect(summary.unchanged).toEqual([]);
    expect(calls.filter((c) => c.method === "POST").length).toBe(
      CANONICAL_LABELS.length,
    );
    expect(calls[0]?.body).toEqual({
      name: "backlog",
      colour: CANONICAL_LABELS[0].color,
      description: CANONICAL_LABELS[0].description,
    });
  });

  test("patches drift under the existing spelling", async () => {
    existing = [{ name: "Backlog", colour: "000000", description: "old" }];

    const summary = await provisionRepoLabels("acme", "widgets");

    expect(summary.updated).toEqual(["backlog"]);
    expect(calls).toContainEqual({
      method: "PATCH",
      path: "/repos/acme/widgets/labels/Backlog",
      body: {
        color: CANONICAL_LABELS[0].color,
        description: CANONICAL_LABELS[0].description,
      },
    });
  });

  test("a converged label issues no write", async () => {
    existing = [
      {
        name: "backlog",
        colour: CANONICAL_LABELS[0].color.toUpperCase(),
        description: CANONICAL_LABELS[0].description,
      },
    ];

    const summary = await provisionRepoLabels("acme", "widgets", [
      CANONICAL_LABELS[0],
    ]);

    expect(summary.created).toEqual([]);
    expect(summary.updated).toEqual([]);
    expect(summary.unchanged).toEqual(["backlog"]);
    expect(calls).toEqual([]);
  });

  test("matches names case-insensitively without creating a duplicate", async () => {
    existing = [
      {
        name: "BACKLOG",
        colour: CANONICAL_LABELS[0].color,
        description: CANONICAL_LABELS[0].description,
      },
    ];

    const summary = await provisionRepoLabels("acme", "widgets", [
      CANONICAL_LABELS[0],
    ]);

    expect(summary.unchanged).toEqual(["backlog"]);
    expect(calls).toEqual([]);
  });

  test("treats a null description as drift", async () => {
    existing = [
      {
        name: "md",
        colour: CANONICAL_LABELS.find((l) => l.name === "md")!.color,
        description: undefined,
      },
    ];

    const summary = await provisionRepoLabels("acme", "widgets", [
      CANONICAL_LABELS.find((l) => l.name === "md")!,
    ]);

    expect(summary.updated).toEqual(["md"]);
    expect(calls).toEqual([
      {
        method: "PATCH",
        path: "/repos/acme/widgets/labels/md",
        body: {
          color: CANONICAL_LABELS.find((l) => l.name === "md")!.color,
          description: CANONICAL_LABELS.find((l) => l.name === "md")!
            .description,
        },
      },
    ]);
  });

  test("leaves non-canonical labels alone", async () => {
    existing = [{ name: "bug", colour: "123456", description: "keep me" }];

    const summary = await provisionRepoLabels("acme", "widgets");

    expect(summary.created).toHaveLength(CANONICAL_LABELS.length);
    expect(calls.some((c) => (c.body as { name?: string })?.name === "bug")).toBe(
      false,
    );
  });

  test("resolves the installation and lists through its provider", async () => {
    await provisionRepoLabels("acme", "widgets", []);

    expect(idSpy).toHaveBeenCalledWith("acme", "widgets");
    expect(providerSpy).toHaveBeenCalledWith(777);
  });

  test("rejects when the App is not installed on the repo", async () => {
    idSpy.mockRejectedValue(new ForgeApiError("Not Found", 404, ""));

    await expect(provisionRepoLabels("bad", "core")).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("provisionCanonicalLabels", () => {
  test("provisions every configured repo and aggregates the report", async () => {
    setConfig({
      ...TEST_CONFIG,
      repos: [
        { repo: "orgA/core", shortcode: "CORE" },
        { repo: "orgA/web", shortcode: "WEB" },
      ],
    });

    const report = await provisionCanonicalLabels();

    expect(report.failed).toBe(0);
    expect(report.repos.map((r) => r.repo)).toEqual(["orgA/core", "orgA/web"]);
    expect(report.created).toBe(CANONICAL_LABELS.length * 2);
    expect(report.updated).toBe(0);

    expect(logs.find("labels", "label provisioning started")).toMatchObject({
      level: "info",
      component: "labels",
      repos: 2,
    });
    expect(logs.find("labels", "repo labels reconciled")).toMatchObject({
      level: "info",
      component: "labels",
      repo: "orgA/core",
      created: CANONICAL_LABELS.length,
      updated: 0,
      unchanged: 0,
      durationMs: expect.any(Number),
    });
    expect(logs.find("labels", "label provisioning finished")).toMatchObject({
      level: "info",
      component: "labels",
      repos: 2,
      created: CANONICAL_LABELS.length * 2,
      updated: 0,
      failed: 0,
      durationMs: expect.any(Number),
    });
  });

  test("isolates a failing repo so the others still reconcile", async () => {
    const config: FunnelConfig = {
      ...TEST_CONFIG,
      repos: [
        { repo: "good/core", shortcode: "GOOD" },
        { repo: "bad/core", shortcode: "BAD" },
      ],
    };
    setConfig(config);
    idSpy.mockImplementation((async (owner: string) => {
      if (owner === "bad") throw new ForgeApiError("Not Found", 404, "");
      return 777;
    }) as never);

    const report = await provisionCanonicalLabels();

    expect(report.failed).toBe(1);
    const good = report.repos.find((r) => r.repo === "good/core");
    expect(good?.summary?.created).toHaveLength(CANONICAL_LABELS.length);
    const bad = report.repos.find((r) => r.repo === "bad/core");
    expect(bad?.error).toContain("404");
    expect(logs.find("labels", "provisioning failed")).toMatchObject({
      level: "warn",
      component: "labels",
      repo: "bad/core",
      status: 404,
      err: expect.objectContaining({ message: expect.any(String) }),
    });
  });

  test("resolves with an empty report when config cannot be loaded", async () => {
    // Force a load failure deterministically: `intake.default_repo` points at a
    // repository that is not configured, which the cross-field validation
    // rejects (a plain empty store would now be a valid fresh-install config).
    writeSettings({
      repos: [],
      projects: [],
      intake: { default_repo: "ghost/repo" },
      sync: TEST_CONFIG.sync,
      board: TEST_CONFIG.board,
      session: TEST_CONFIG.session,
      notifications: TEST_CONFIG.notifications,
      planning: TEST_CONFIG.planning,
    });
    resetConfigCache();
    try {
      const report = await provisionCanonicalLabels();
      expect(report).toEqual({ repos: [], created: 0, updated: 0, failed: 0 });
    } finally {
      clearSettings();
      resetConfigCache();
    }
  });
});
