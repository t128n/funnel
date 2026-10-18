import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ConfigError,
  DEFAULT_CONFIG,
  getConfig,
  loadFunnelConfig,
  resetConfigCache,
} from "./config";

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

/** Create a temp cwd containing a `funnel.config.yaml` with `yaml` contents. */
function configDir(yaml: string): string {
  const dir = mkdtempSync(join(tmpdir(), "funnel-config-"));
  dirs.push(dir);
  writeFileSync(join(dir, "funnel.config.yaml"), yaml);
  return dir;
}

describe("loadFunnelConfig", () => {
  test("loads and validates a full config, de-duplicating repos", async () => {
    const cwd = configDir(`
github:
  url: https://acme.ghe.com
  api_url: https://acme.ghe.com/api/v3
repos:
  - orgA/core
  - orgA/web
  - orgA/core
intake:
  default_repo: orgA/core
sync:
  history_days: 30
  poll_interval_active_seconds: 10
  poll_interval_idle_seconds: 120
board:
  done_days: 7
session:
  idle_days: 1
`);

    const config = await loadFunnelConfig({ cwd });

    expect(config).toEqual({
      github: {
        url: "https://acme.ghe.com",
        api_url: "https://acme.ghe.com/api/v3",
      },
      repos: ["orgA/core", "orgA/web"],
      intake: { default_repo: "orgA/core" },
      sync: {
        history_days: 30,
        poll_interval_active_seconds: 10,
        poll_interval_idle_seconds: 120,
      },
      board: { done_days: 7, wip_limits: {} },
      session: { idle_days: 1 },
    });
  });

  test("fills omitted sections from defaults", async () => {
    const cwd = configDir(`
repos:
  - orgA/core
`);

    const config = await loadFunnelConfig({ cwd });

    expect(config.github).toEqual(DEFAULT_CONFIG.github);
    expect(config.sync).toEqual(DEFAULT_CONFIG.sync);
    expect(config.board).toEqual(DEFAULT_CONFIG.board);
    expect(config.session).toEqual(DEFAULT_CONFIG.session);
    expect(config.intake).toEqual({});
  });

  test("fails when repos is empty or missing", async () => {
    const empty = configDir("repos: []\n");
    await expect(loadFunnelConfig({ cwd: empty })).rejects.toBeInstanceOf(
      ConfigError,
    );

    const missing = configDir("github:\n  url: https://github.com\n");
    await expect(loadFunnelConfig({ cwd: missing })).rejects.toThrow(
      /repository/i,
    );
  });

  test("rejects a malformed repository identifier", async () => {
    const cwd = configDir("repos:\n  - not-a-repo\n");
    await expect(loadFunnelConfig({ cwd })).rejects.toThrow(/owner\/name/);
  });

  test("rejects an invalid github.url", async () => {
    const cwd = configDir("repos:\n  - orgA/core\ngithub:\n  url: not-a-url\n");
    await expect(loadFunnelConfig({ cwd })).rejects.toThrow(/github\.url/);
  });

  test("rejects intake.default_repo that is not configured", async () => {
    const cwd = configDir(`
repos:
  - orgA/core
intake:
  default_repo: orgB/other
`);
    await expect(loadFunnelConfig({ cwd })).rejects.toThrow(/default_repo/);
  });
});

describe("getConfig", () => {
  test("caches one load until reset", () => {
    resetConfigCache();
    const first = getConfig();
    const second = getConfig();
    expect(second).toBe(first);

    resetConfigCache();
    const third = getConfig();
    expect(third).not.toBe(first);

    // Avoid unhandled rejections if the repo root has no config file.
    for (const p of [first, third]) p.catch(() => {});
    resetConfigCache();
  });
});
