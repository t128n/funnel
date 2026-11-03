import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSetup } from "./setup";

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "funnel-setup-test-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("setup dry run", () => {
  test("prints a plan without creating files", async () => {
    const root = tempDir();
    const installDir = join(root, "bin");
    const configFile = join(root, "config", "funnel.env");
    const dataDir = join(root, "data");
    const logDir = join(root, "logs");

    await runSetup([
      "--yes",
      "--dry-run",
      "--json",
      "--mode",
      "portable",
      "--install-dir",
      installDir,
      "--config-file",
      configFile,
      "--data-dir",
      dataDir,
      "--log-dir",
      logDir,
      "--port",
      "3210",
      "--url",
      "https://funnel.example.com",
    ]);

    expect(existsSync(installDir)).toBe(false);
    expect(existsSync(configFile)).toBe(false);
    expect(existsSync(dataDir)).toBe(false);
    expect(existsSync(logDir)).toBe(false);
    expect(existsSync(join(root, "config", "install.json"))).toBe(false);
  });
});
