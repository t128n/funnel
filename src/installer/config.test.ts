import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  formatEnvValue,
  generateSecret,
  normalizePublicUrl,
  readEnvValue,
  readManifest,
  validateLogLevel,
  validatePort,
  writeEnvFile,
  writeManifest,
} from "./config";
import { envTemplate } from "./templates";
import type { InstallManifest } from "./types";

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "funnel-config-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("envTemplate", () => {
  test("stays identical to the documented .env.example", () => {
    const file = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");
    expect(envTemplate).toBe(file);
  });
});

describe("writeEnvFile", () => {
  test("writes from the template and replaces the managed keys", () => {
    const dir = tempDir();
    const path = join(dir, "funnel.env");
    const result = writeEnvFile({
      path,
      publicUrl: "https://funnel.example.com",
      onboardingToken: "token with spaces",
      logLevel: "debug",
      port: 3100,
      host: "127.0.0.1",
      dataDir: "C:\\ProgramData\\Funnel Data",
    });

    expect(result.written).toBe(true);
    const content = readFileSync(path, "utf8");
    expect(content).toContain("FUNNEL_URL=https://funnel.example.com");
    expect(content).toContain('FUNNEL_ONBOARDING_TOKEN="token with spaces"');
    expect(content).toContain("LOG_LEVEL=debug");
    expect(content).toContain("PORT=3100");
    expect(content).toContain("HOST=127.0.0.1");
    expect(content).toContain('FUNNEL_DATA_DIR="C:\\ProgramData\\Funnel Data"');
    expect(readEnvValue(content, "FUNNEL_SECRET")?.length).toBeGreaterThanOrEqual(32);
    expect(content.charCodeAt(0)).not.toBe(0xfeff);
  });

  test("keeps an existing secret when forced", () => {
    const dir = tempDir();
    const path = join(dir, "funnel.env");
    writeEnvFile({ path, secret: "a".repeat(44), publicUrl: "https://old.example.com" });
    const oldSecret = readEnvValue(readFileSync(path, "utf8"), "FUNNEL_SECRET");

    const result = writeEnvFile({
      path,
      secret: "b".repeat(44),
      publicUrl: "https://new.example.com",
      force: true,
    });

    expect(result.written).toBe(true);
    expect(result.backup).toContain(".env.bak-");
    const content = readFileSync(path, "utf8");
    expect(readEnvValue(content, "FUNNEL_SECRET")).toBe(oldSecret);
    expect(content).toContain("FUNNEL_URL=https://new.example.com");
  });

  test("does not replace an existing file without force", () => {
    const dir = tempDir();
    const path = join(dir, "funnel.env");
    writeFileSync(path, "FUNNEL_SECRET=existing\n");
    const result = writeEnvFile({ path, secret: generateSecret() });
    expect(result.written).toBe(false);
    expect(readFileSync(path, "utf8")).toBe("FUNNEL_SECRET=existing\n");
  });
});

describe("validation", () => {
  test("formats values that need quoting", () => {
    expect(formatEnvValue("plain")).toBe("plain");
    expect(formatEnvValue("with space")).toBe('"with space"');
    expect(formatEnvValue("hash#value")).toBe('"hash#value"');
    expect(formatEnvValue('a"b')).toBe('"a\\"b"');
  });

  test("normalizes public URLs", () => {
    expect(normalizePublicUrl("https://funnel.example.com/")).toBe(
      "https://funnel.example.com",
    );
    expect(normalizePublicUrl("")).toBe("");
    expect(() => normalizePublicUrl("ftp://example.com")).toThrow();
    expect(() => normalizePublicUrl("https://example.com/path")).toThrow();
    expect(() => normalizePublicUrl("not a url")).toThrow();
  });

  test("validates ports and log levels", () => {
    expect(() => validatePort(3000)).not.toThrow();
    expect(() => validatePort(0)).toThrow();
    expect(() => validatePort(70000)).toThrow();
    expect(() => validateLogLevel("info")).not.toThrow();
    expect(() => validateLogLevel("verbose")).toThrow();
  });
});

describe("manifest", () => {
  test("round-trips install metadata", () => {
    const dir = tempDir();
    const path = join(dir, "install.json");
    const manifest: InstallManifest = {
      version: "0.1.0",
      platform: "linux",
      mode: "system",
      installDir: "/usr/local/bin",
      configFile: "/etc/funnel/funnel.env",
      dataDir: "/var/lib/funnel",
      logDir: "/var/log/funnel",
      manifestPath: path,
      port: 3000,
      host: "0.0.0.0",
      url: "https://funnel.example.com",
      logLevel: "info",
      logMode: "journald",
      serviceName: "funnel",
      launchdLabel: "io.github.t128n.funnel",
      installedAt: new Date(0).toISOString(),
    };
    writeManifest(path, manifest);
    expect(readManifest(path)).toEqual(manifest);
  });
});
