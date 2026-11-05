/**
 * `/settings/sync` route contract: the load exposes the health projection and
 * the manual `sync` action stays admin-only, runs the real cycle, and reports
 * per-repository failures without losing the updated timestamps.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from "bun:test";
import type { ThreadQuery } from "forges";
import { resetConfigCache, setConfig } from "#/lib/server/config";
import { forge } from "#/lib/server/forge/providers.server";
import { clearSettings } from "#/lib/server/settings/store";
import * as mirror from "#lib/server/sync/mirror";
import { clearMirror } from "#tests/mirror-helpers";
import { TEST_CONFIG } from "#tests/test-config";
import {
  actions,
  load,
} from "#/routes/(app)/settings/sync/+page.server";

const ADMIN = {
  id: "admin",
  name: "Admin",
  email: "admin@example.com",
  image: null,
  role: "admin" as const,
};
const WRITER = { ...ADMIN, id: "writer", role: "write" as const };

let failCycle = false;
let repoId = 0;
let providerSpy: { mockRestore(): void };
let installationSpy: { mockRestore(): void };

const provider = {
  request: async () => ({ data: [] }),
  repos: {
    get: async () => ({
      ref: {
        forge: "github",
        instance: "github.com",
        owner: "orgA",
        name: "core",
        externalId: "1",
      },
      isArchived: false,
    }),
    labels: () => ({ async *[Symbol.asyncIterator]() {} }),
    assignableUsers: () => ({ async *[Symbol.asyncIterator]() {} }),
  },
  threads: {
    list: (_repo: unknown, _query: ThreadQuery = {}) => ({
      page: async () => {
        if (failCycle) throw new Error("boom");
        return { items: [], notModified: true };
      },
    }),
  },
};

beforeEach(() => {
  clearMirror();
  clearSettings();
  setConfig(TEST_CONFIG);
  forge.resetCaches();
  failCycle = false;
  repoId = mirror.upsertRepo({
    externalId: "1",
    forge: "github",
    instance: "github.com",
    org: "orgA",
    name: "core",
    url: "https://github.com/orgA/core",
    archived: false,
  }).id;
  // Skip the first-cycle directory refresh; the poll itself is what we assert.
  mirror.setRepoPolledAt(repoId, 1);
  installationSpy = spyOn(forge, "getInstallationId").mockResolvedValue(7);
  providerSpy = spyOn(forge, "installationProvider").mockResolvedValue(
    provider as never,
  );
});

afterEach(() => {
  providerSpy.mockRestore();
  installationSpy.mockRestore();
  forge.resetCaches();
  clearMirror();
  clearSettings();
  resetConfigCache();
});

describe("sync settings load", () => {
  test("returns the cadence and the per-repo health projection", async () => {
    mirror.setRepoReconciledAt(repoId, 5_000);
    mirror.setRepoPolledAt(repoId, 4_000);

    const data = await load();

    expect(data.sync).toMatchObject({
      history_days: 90,
      poll_interval_active_seconds: 30,
      poll_interval_idle_seconds: 300,
    });
    expect(data.status.repos).toEqual([
      {
        repo: "orgA/core",
        lastPolledAt: 4_000,
        lastReconciledAt: 5_000,
        degraded: false,
        mirrored: true,
      },
    ]);
    expect(data.status.degradedCount).toBe(0);
  });
});

describe("manual sync action", () => {
  test("an admin runs the cycle and the next load shows the new timestamp", async () => {
    const before = mirror.getRepo(repoId)?.lastPolledAt ?? 0;

    const result = await actions.sync({
      locals: { user: ADMIN, session: null },
    } as never);

    expect(result).toMatchObject({ synced: true, repos: 1 });
    const after = mirror.getRepo(repoId)?.lastPolledAt ?? 0;
    expect(after).toBeGreaterThan(before);
    expect(mirror.getRepo(repoId)?.degraded).toBe(0);

    const data = await load();
    expect(data.status.repos[0]?.lastPolledAt).toBe(after);
    expect(data.status.repos[0]?.degraded).toBe(false);
  });

  test("a non-admin is rejected without running the cycle", async () => {
    const before = mirror.getRepo(repoId)?.lastPolledAt ?? 0;

    const result = (await actions.sync({
      locals: { user: WRITER, session: null },
    } as never)) as { status: number; data: { syncError: string } };

    expect(result.status).toBe(403);
    expect(result.data.syncError).toBe("Administrator role required");
    expect(mirror.getRepo(repoId)?.lastPolledAt).toBe(before);
  });

  test("an unauthenticated request is rejected", async () => {
    const result = (await actions.sync({
      locals: { user: null, session: null },
    } as never)) as { status: number };

    expect(result.status).toBe(401);
  });

  test("a failing cycle surfaces an error and leaves the repo degraded", async () => {
    failCycle = true;

    const result = (await actions.sync({
      locals: { user: ADMIN, session: null },
    } as never)) as { status: number; data: { syncError: string } };

    expect(result.status).toBe(502);
    expect(result.data.syncError).toContain("all 1 configured repositories");
    expect(mirror.getRepo(repoId)?.degraded).toBe(1);

    // The load still reports the failure even though the action failed.
    const data = await load();
    expect(data.status.degradedCount).toBe(1);
    expect(data.status.repos[0]?.degraded).toBe(true);
  });
});
