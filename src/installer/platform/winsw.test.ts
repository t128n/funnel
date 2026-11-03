import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  locateWinSw,
  materializeWinSw,
  sha256File,
  winSwCandidates,
  WINSW_SHA256,
} from "./winsw";

const temporaryDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "funnel-winsw-test-"));
  temporaryDirs.push(dir);
  return dir;
}

function writeFile(path: string, content: string | Uint8Array): string {
  writeFileSync(path, content);
  return path;
}

afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("WinSW pinning", () => {
  test("records the WinSW 2.12.0 asset hash", () => {
    expect(WINSW_SHA256).toMatch(/^[0-9a-f]{64}$/);
    expect(WINSW_SHA256).toBe(
      "b5066b7bbdfba1293e5d15cda3caaea88fbeab35bd5b38c41c913d492aadfc4f",
    );
  });
});

describe("winSwCandidates", () => {
  test("checks the env override, sibling host, then vendor paths", () => {
    const candidates = winSwCandidates({
      env: { FUNNEL_WINSW_PATH: "/opt/winsw/WinSW.exe" },
      execPath: "/opt/funnel/funnel.exe",
      cwd: "/srv/funnel",
      moduleDir: "/srv/funnel/src/installer/platform",
    });

    expect(candidates[0]).toEqual({
      path: "/opt/winsw/WinSW.exe",
      source: "env",
    });
    expect(candidates[1]).toEqual({
      path: "/opt/funnel/funnel-service.exe",
      source: "sibling",
    });
    expect(candidates).toContainEqual({
      path: "/srv/funnel/vendor/winsw/WinSW.NET461.exe",
      source: "vendor",
    });
  });
});

describe("locateWinSw", () => {
  test("finds the sibling funnel-service.exe next to the executable", () => {
    const dir = tempDir();
    const sibling = writeFile(join(dir, "funnel-service.exe"), "winsw");

    expect(
      locateWinSw({
        env: {},
        execPath: join(dir, "funnel.exe"),
        cwd: tempDir(),
        moduleDir: tempDir(),
      }),
    ).toEqual({ path: sibling, source: "sibling" });
  });

  test("finds a vendored WinSW asset", () => {
    const root = tempDir();
    const vendor = join(root, "vendor", "winsw");
    const binary = join(vendor, "WinSW.NET461.exe");
    mkdirSync(vendor, { recursive: true });
    writeFile(binary, "winsw");

    expect(
      locateWinSw({
        env: {},
        execPath: join(tempDir(), "funnel.exe"),
        cwd: root,
        moduleDir: tempDir(),
      }),
    ).toEqual({ path: binary, source: "vendor" });
  });

  test("fails clearly when FUNNEL_WINSW_PATH is missing", () => {
    const dir = tempDir();
    const missing = join(dir, "missing.exe");

    expect(() =>
      locateWinSw({
        env: { FUNNEL_WINSW_PATH: missing },
        execPath: join(dir, "funnel.exe"),
        cwd: dir,
        moduleDir: dir,
      }),
    ).toThrow(/FUNNEL_WINSW_PATH points to a missing file/);
  });

  test("lists the searched paths when nothing is found", () => {
    const dir = tempDir();
    expect(() =>
      locateWinSw({
        env: {},
        execPath: join(dir, "funnel.exe"),
        cwd: dir,
        moduleDir: dir,
      }),
    ).toThrow(/WinSW 2\.12\.0 .* was not found/);
  });
});

describe("materializeWinSw", () => {
  test("dry-run verifies the source without writing the target", async () => {
    const dir = tempDir();
    const source = writeFile(join(dir, "WinSW.NET461.exe"), "verified winsw");
    const expectedSha256 = sha256File(source);
    const target = join(dir, "install", "funnel-service.exe");

    const result = await materializeWinSw(target, {
      source,
      expectedSha256,
      dryRun: true,
    });

    expect(result).toMatchObject({
      path: target,
      source,
      verified: true,
      copied: false,
    });
    expect(existsSync(target)).toBe(false);
  });

  test("copies and verifies a matching binary", async () => {
    const dir = tempDir();
    const source = writeFile(join(dir, "WinSW.NET461.exe"), "verified winsw");
    const expectedSha256 = sha256File(source);
    const target = join(dir, "install", "funnel-service.exe");

    const result = await materializeWinSw(target, {
      source,
      expectedSha256,
    });

    expect(result.copied).toBe(true);
    expect(result.verified).toBe(true);
    expect(readFileSync(target, "utf8")).toBe("verified winsw");
  });

  test("refuses to copy a binary whose hash does not match", async () => {
    const dir = tempDir();
    const source = writeFile(join(dir, "WinSW.NET461.exe"), "tampered");
    const target = join(dir, "install", "funnel-service.exe");

    await expect(
      materializeWinSw(target, {
        source,
        expectedSha256: createHash("sha256").update("other").digest("hex"),
      }),
    ).rejects.toThrow(/integrity check failed/);
    expect(existsSync(target)).toBe(false);
  });

  test("fails without downloading when no source can be found", async () => {
    const dir = tempDir();
    const missing = join(dir, "missing.exe");

    await expect(
      materializeWinSw(join(dir, "install", "funnel-service.exe"), {
        env: { FUNNEL_WINSW_PATH: missing },
        execPath: join(dir, "funnel.exe"),
        cwd: dir,
        moduleDir: dir,
      }),
    ).rejects.toThrow(/FUNNEL_WINSW_PATH points to a missing file/);
  });
});
