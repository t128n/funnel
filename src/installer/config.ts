import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { envTemplate } from "./templates";
import type { InstallManifest, LogMode } from "./types";

export interface WriteEnvOptions {
  path: string;
  template?: string;
  secret?: string;
  publicUrl?: string;
  onboardingToken?: string;
  logLevel?: string;
  port?: number;
  host?: string;
  dataDir?: string;
  force?: boolean;
  newSecret?: boolean;
}

export interface WriteEnvResult {
  written: boolean;
  path: string;
  backup?: string;
}

const LOG_LEVELS = new Set([
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
]);

export function generateSecret(): string {
  return randomBytes(32).toString("base64");
}

export function formatEnvValue(value: string | number | undefined): string {
  if (value === undefined || value === null) return "";
  const text = String(value);
  if (!/[\s#"']/.test(text)) return text;
  return `"${text.replaceAll('"', '\\"')}"`;
}

export function readEnvValue(content: string, key: string): string | undefined {
  // Horizontal whitespace only: `\s` also matches newlines, which made an
  // empty value such as `FUNNEL_URL=` capture the first line of the next
  // comment block instead of "".
  const pattern = new RegExp(
    `^[\\t ]*${escapeRegExp(key)}[\\t ]*=[\\t ]*(.*)$`,
    "m",
  );
  const match = pattern.exec(content);
  if (!match) return undefined;
  let value = match[1].trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1);
  }
  return value;
}

export function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const content = readFileSync(path, "utf8");
  const result: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    result[match[1]] = match[2];
  }
  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function setLine(lines: string[], key: string, value: string): void {
  const pattern = new RegExp(
    `^[\\t ]*#?[\\t ]*${escapeRegExp(key)}[\\t ]*=`,
  );
  for (let index = 0; index < lines.length; index += 1) {
    if (pattern.test(lines[index])) {
      lines[index] = `${key}=${formatEnvValue(value)}`;
      return;
    }
  }
  lines.push(`${key}=${formatEnvValue(value)}`);
}

function backupFile(path: string): string {
  const stamp = new Date()
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(/\..+$/, "")
    .replace("T", "-");
  const backup = `${path}.bak-${stamp}`;
  copyFileSync(path, backup);
  return backup;
}

export function writeEnvFile(options: WriteEnvOptions): WriteEnvResult {
  const path = options.path;
  const exists = existsSync(path);
  if (exists && !options.force) {
    return { written: false, path };
  }

  const existing = exists ? readFileSync(path, "utf8") : "";
  const existingSecret = exists
    ? readEnvValue(existing, "FUNNEL_SECRET")
    : undefined;
  const secret =
    options.newSecret || !existingSecret
      ? (options.secret ?? generateSecret())
      : existingSecret;

  let backup: string | undefined;
  if (exists) backup = backupFile(path);

  const lines = (options.template ?? envTemplate).split(/\r?\n/);
  setLine(lines, "FUNNEL_URL", options.publicUrl ?? "");
  setLine(lines, "FUNNEL_SECRET", secret);
  if (options.logLevel) setLine(lines, "LOG_LEVEL", options.logLevel);
  if (options.dataDir) setLine(lines, "FUNNEL_DATA_DIR", options.dataDir);
  if (options.port !== undefined) setLine(lines, "PORT", String(options.port));
  if (options.host) setLine(lines, "HOST", options.host);
  if (options.onboardingToken) {
    setLine(lines, "FUNNEL_ONBOARDING_TOKEN", options.onboardingToken);
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${lines.join("\n").replace(/\n+$/, "")}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  if (process.platform !== "win32") {
    try {
      chmodSync(path, 0o600);
    } catch {
      // Best effort; the caller can surface a permission warning.
    }
  }

  return { written: true, path, backup };
}

export function normalizePublicUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Public URL must be an absolute http:// or https:// URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Public URL must start with http:// or https://.");
  }
  if (
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(
      "Public URL must be an origin only (no path, query, or fragment).",
    );
  }
  return trimmed.replace(/\/$/, "");
}

export function validatePort(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error("Port must be an integer between 1 and 65535.");
  }
}

export function validateLogLevel(value: string): void {
  if (!LOG_LEVELS.has(value)) {
    throw new Error(
      `LOG_LEVEL must be one of ${[...LOG_LEVELS].join(", ")}.`,
    );
  }
}

export function normalizeLogMode(value: string | undefined): LogMode {
  return value === "journald" || value === "file" ? value : "file";
}

export function readManifest(path: string): InstallManifest | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as InstallManifest;
  } catch {
    return undefined;
  }
}

export function writeManifest(path: string, manifest: InstallManifest): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export function backupBinary(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  const backup = `${path}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  copyFileSync(path, backup);
  return backup;
}

export function envFileTemplate(): string {
  return envTemplate;
}
