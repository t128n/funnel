import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { binaryPath, logFilePath, removeBinary } from "./files";

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "funnel-files-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function configFor(installDir: string) {
  return {
    installDir,
    dataDir: join(installDir, "..", "data"),
    logDir: join(installDir, "..", "logs"),
    platform: "linux" as const,
  };
}

describe("platform paths", () => {
  test("uses the target platform's separators, not the host's", () => {
    const base = {
      dataDir: "/var/lib/funnel",
      logDir: "/var/log/funnel",
    };

    expect(
      binaryPath({ ...base, installDir: "/opt/funnel/bin", platform: "linux" }),
    ).toBe("/opt/funnel/bin/funnel");
    expect(
      logFilePath({ ...base, installDir: "/opt/funnel/bin", platform: "linux" }),
    ).toBe("/var/log/funnel/funnel.log");
    expect(
      binaryPath({
        dataDir: "C:\\ProgramData\\Funnel\\data",
        logDir: "C:\\ProgramData\\Funnel\\logs",
        installDir: "C:\\Program Files\\Funnel",
        platform: "windows",
      }),
    ).toBe("C:\\Program Files\\Funnel\\funnel.exe");
    expect(
      logFilePath({
        dataDir: "C:\\ProgramData\\Funnel\\data",
        logDir: "C:\\ProgramData\\Funnel\\logs",
        installDir: "C:\\Program Files\\Funnel",
        platform: "windows",
      }),
    ).toBe("C:\\ProgramData\\Funnel\\logs\\funnel.log");
  });
});

describe("removeBinary", () => {
  test("removes the binary and leftover image copies, but keeps other files", () => {
    const installDir = join(tempDir(), "bin");
    mkdirSync(installDir, { recursive: true });
    for (const name of [
      "funnel",
      "funnel.running-1",
      "funnel.bak-20260101",
      "funnel.failed-20260101",
      "funnel.removed-20260101",
      "keep.txt",
    ]) {
      writeFileSync(join(installDir, name), name);
    }

    const result = removeBinary(configFor(installDir));

    expect(result.pending).toBeUndefined();
    for (const name of [
      "funnel",
      "funnel.running-1",
      "funnel.bak-20260101",
      "funnel.failed-20260101",
      "funnel.removed-20260101",
    ]) {
      expect(existsSync(join(installDir, name))).toBe(false);
    }
    expect(existsSync(join(installDir, "keep.txt"))).toBe(true);
  });

  test("is a no-op when the install directory is empty", () => {
    const installDir = join(tempDir(), "bin");
    mkdirSync(installDir, { recursive: true });

    expect(removeBinary(configFor(installDir)).pending).toBeUndefined();
  });
});
