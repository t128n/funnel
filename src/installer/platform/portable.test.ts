import { afterEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPortableServiceManager } from "./portable";
import type { InstallConfig } from "../types";

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "funnel-portable-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function configFor(root: string): InstallConfig {
  const installDir = join(root, "bin");
  return {
    installDir,
    configFile: join(root, "funnel.env"),
    dataDir: join(root, "data"),
    logDir: join(root, "logs"),
    manifestPath: join(installDir, "install.json"),
    version: "test",
    platform: process.platform === "darwin" ? "macos" : "linux",
    mode: "portable",
    port: 3999,
    host: "127.0.0.1",
    url: "",
    logLevel: "info",
    logMode: "file",
    force: false,
    dryRun: false,
    noElevate: false,
    serviceName: "funnel",
    launchdLabel: "io.github.t128n.funnel",
  };
}

describe("portable stop", () => {
  test("stops a process running the installed image when the manifest has no PID", async () => {
    if (process.platform === "win32") return; // Uses /bin/sleep below.

    const root = tempDir();
    const config = configFor(root);
    mkdirSync(config.installDir, { recursive: true });

    const binary = join(config.installDir, "funnel");
    copyFileSync("/bin/sleep", binary);
    chmodSync(binary, 0o755);

    writeFileSync(
      config.manifestPath,
      JSON.stringify({ ...config, installedAt: new Date().toISOString() }),
    );

    const child = Bun.spawn({
      cmd: [binary, "30"],
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    });
    child.unref();

    await createPortableServiceManager(config).stop();

    const exited = await Promise.race([
      child.exited.then(() => true),
      Bun.sleep(3_000).then(() => false),
    ]);
    expect(exited).toBe(true);
  }, 10_000);
});
