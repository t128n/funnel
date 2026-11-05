/**
 * `syncStatus` joins the configured repository list with the disposable mirror
 * rows. These cases pin the three product states: configured but never synced,
 * synced with timestamps, and degraded after a failed cycle.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { resetConfigCache, setConfig } from "#/lib/server/config";
import { clearSettings } from "#/lib/server/settings/store";
import { clearMirror } from "#tests/mirror-helpers";
import { TEST_CONFIG } from "#tests/test-config";
import * as mirror from "./mirror";
import { syncStatus } from "./status";

beforeEach(() => {
  clearMirror();
  clearSettings();
  setConfig(TEST_CONFIG);
});

afterEach(() => {
  clearMirror();
  clearSettings();
  resetConfigCache();
});

/** Seed the mirror row for the configured `orgA/core` repository. */
function seedRepo(): number {
  return mirror.upsertRepo({
    externalId: "1",
    forge: "github",
    instance: "github.com",
    org: "orgA",
    name: "core",
    url: "https://github.com/orgA/core",
    archived: false,
  }).id;
}

describe("syncStatus", () => {
  test("reports a configured repository before its first mirror row exists", async () => {
    const status = await syncStatus(1_234);

    expect(status.checkedAt).toBe(1_234);
    expect(status.degradedCount).toBe(0);
    expect(status.repos).toEqual([
      {
        repo: "orgA/core",
        lastPolledAt: null,
        lastReconciledAt: null,
        degraded: false,
        mirrored: false,
      },
    ]);
  });

  test("projects the mirror timestamps and healthy state", async () => {
    const repoId = seedRepo();
    mirror.setRepoPolledAt(repoId, 10_000);
    mirror.setRepoReconciledAt(repoId, 20_000);

    const status = await syncStatus(30_000);

    expect(status.repos).toEqual([
      {
        repo: "orgA/core",
        lastPolledAt: 10_000,
        lastReconciledAt: 20_000,
        degraded: false,
        mirrored: true,
      },
    ]);
    expect(status.degradedCount).toBe(0);
  });

  test("counts only degraded configured repositories", async () => {
    setConfig({
      ...TEST_CONFIG,
      repos: [
        { repo: "orgA/core", shortcode: "CORE" },
        { repo: "orgA/api", shortcode: "API" },
      ],
    });
    const repoId = seedRepo();
    mirror.setRepoDegraded(repoId, true);
    mirror.upsertRepo({
      externalId: "2",
      forge: "github",
      instance: "github.com",
      org: "orgA",
      name: "api",
      url: "https://github.com/orgA/api",
      archived: false,
    });

    const status = await syncStatus();

    expect(status.degradedCount).toBe(1);
    expect(status.repos.map((repo) => [repo.repo, repo.degraded])).toEqual([
      ["orgA/core", true],
      ["orgA/api", false],
    ]);
  });
});
