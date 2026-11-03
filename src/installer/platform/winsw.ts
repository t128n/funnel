import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Pinned WinSW release used as the Windows service host. */
export const WINSW_VERSION = "2.12.0";
export const WINSW_ASSET = "WinSW.NET461.exe";
export const WINSW_SHA256 =
  "b5066b7bbdfba1293e5d15cda3caaea88fbeab35bd5b38c41c913d492aadfc4f";
export const WINSW_DOWNLOAD_URL = `https://github.com/winsw/winsw/releases/download/v${WINSW_VERSION}/${WINSW_ASSET}`;
export const WINSW_VENDOR_PATH = join("vendor", "winsw", WINSW_ASSET);

/** WinSW requires the XML config to share the executable's base name. */
export const SERVICE_EXECUTABLE_NAME = "funnel-service.exe";

export type WinSwSource = "env" | "sibling" | "vendor";

export interface FoundWinSw {
  path: string;
  source: WinSwSource;
}

export interface LocateWinSwOptions {
  env?: Record<string, string | undefined>;
  execPath?: string;
  cwd?: string;
  moduleDir?: string;
}

export interface MaterializeWinSwOptions extends LocateWinSwOptions {
  /** Explicit source path; skips discovery. */
  source?: string;
  /** Override the pinned hash, or pass `null` to skip verification. */
  expectedSha256?: string | null;
  /** Locate and verify without writing the target file. */
  dryRun?: boolean;
}

export interface MaterializedWinSw {
  path: string;
  source: string;
  sha256: string;
  verified: boolean;
  copied: boolean;
}

function envGet(
  env: Record<string, string | undefined>,
  name: string,
): string | undefined {
  const exact = env[name];
  if (exact) return exact;
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(env)) {
    if (key.toLowerCase() === lower && value) return value;
  }
  return undefined;
}

/**
 * Candidate locations in priority order. The env override is deliberately
 * first so an air-gapped host can point at any WinSW build.
 */
export function winSwCandidates(
  options: LocateWinSwOptions = {},
): FoundWinSw[] {
  const env = options.env ?? process.env;
  const execPath = options.execPath ?? process.execPath;
  const cwd = options.cwd ?? process.cwd();
  const moduleDir = options.moduleDir ?? import.meta.dir;

  const candidates: FoundWinSw[] = [];
  const override = envGet(env, "FUNNEL_WINSW_PATH")?.trim();
  if (override) {
    candidates.push({ path: resolve(override), source: "env" });
  }

  candidates.push({
    path: join(dirname(execPath), SERVICE_EXECUTABLE_NAME),
    source: "sibling",
  });

  const vendorRoots = [
    cwd,
    dirname(execPath),
    // src/installer/platform -> project root (or the embedded asset root).
    join(moduleDir, "..", "..", ".."),
    join(moduleDir, "..", ".."),
  ];
  for (const root of vendorRoots) {
    candidates.push({
      path: join(root, WINSW_VENDOR_PATH),
      source: "vendor",
    });
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = resolve(candidate.path);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function locateWinSw(
  options: LocateWinSwOptions = {},
): FoundWinSw {
  const candidates = winSwCandidates(options);
  const override = candidates.find((candidate) => candidate.source === "env");
  if (override && !existsSync(override.path)) {
    throw new Error(
      `FUNNEL_WINSW_PATH points to a missing file: ${override.path}. ` +
        `Set it to a WinSW ${WINSW_VERSION} executable or unset it to use the bundled copy.`,
    );
  }

  const found = candidates.find((candidate) => existsSync(candidate.path));
  if (!found) {
    throw new Error(
      `WinSW ${WINSW_VERSION} (${WINSW_ASSET}) was not found. Looked in:\n` +
        candidates.map((candidate) => `  - ${candidate.path}`).join("\n") +
        `\nSet FUNNEL_WINSW_PATH, or run \`bun scripts/fetch-winsw.ts\` to vendor it.`,
    );
  }
  return found;
}

export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/**
 * Copy the WinSW host into the install directory and verify it against the
 * pinned hash. The copy is intentionally explicit: the installer must never
 * download a service binary at install time.
 */
export async function materializeWinSw(
  targetPath: string,
  options: MaterializeWinSwOptions = {},
): Promise<MaterializedWinSw> {
  const found = options.source
    ? { path: options.source, source: "option" as const }
    : locateWinSw(options);

  if (!existsSync(found.path)) {
    throw new Error(`WinSW executable not found: ${found.path}`);
  }

  const expected =
    options.expectedSha256 === undefined
      ? WINSW_SHA256
      : options.expectedSha256;
  const actual = sha256File(found.path);
  if (expected && actual !== expected) {
    throw new Error(
      `WinSW integrity check failed for ${found.path}.\n` +
        `Expected SHA-256: ${expected}\n` +
        `Actual SHA-256:   ${actual}\n` +
        `Delete the file and run \`bun scripts/fetch-winsw.ts\` to download WinSW ${WINSW_VERSION}.`,
    );
  }

  if (options.dryRun) {
    return {
      path: targetPath,
      source: found.path,
      sha256: actual,
      verified: Boolean(expected),
      copied: false,
    };
  }

  mkdirSync(dirname(targetPath), { recursive: true });
  if (resolve(found.path) !== resolve(targetPath)) {
    copyFileSync(found.path, targetPath);
  }

  const copiedHash = sha256File(targetPath);
  if (expected && copiedHash !== expected) {
    throw new Error(
      `WinSW copy at ${targetPath} failed integrity verification ` +
        `(expected ${expected}, got ${copiedHash}).`,
    );
  }

  return {
    path: targetPath,
    source: found.path,
    sha256: copiedHash,
    verified: Boolean(expected),
    copied: resolve(found.path) !== resolve(targetPath),
  };
}
