import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { posix, win32 } from "node:path";

/** POSIX joins must not follow the host separator (tests run on Windows too). */
const posixJoin = posix.join;
const isPosixAbsolute = posix.isAbsolute;
import {
  MANIFEST_FILE,
  type InstallMode,
  type InstallPaths,
  type InstallPlatform,
} from "./types";

export interface PathDefaultsOptions {
  platform: InstallPlatform;
  mode: InstallMode;
  home?: string;
  env?: Record<string, string | undefined>;
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

function joinFor(platform: InstallPlatform, ...parts: string[]): string {
  return platform === "windows" ? win32.join(...parts) : posixJoin(...parts);
}

export function binaryName(platform: InstallPlatform): string {
  return platform === "windows" ? "funnel.exe" : "funnel";
}

export function platformPath(platform: InstallPlatform) {
  return platform === "windows" ? win32 : { join: posixJoin, isAbsolute: isPosixAbsolute };
}

export function isAbsolutePath(
  platform: InstallPlatform,
  value: string,
): boolean {
  return platform === "windows"
    ? win32.isAbsolute(value)
    : isPosixAbsolute(value);
}

export function expandPath(
  value: string,
  platform: InstallPlatform,
  home = homedir(),
  env: Record<string, string | undefined> = process.env,
): string {
  let expanded = value.trim();
  if (!expanded) return expanded;

  if (expanded === "~" || expanded.startsWith("~/")) {
    const rest = expanded.slice(1).replace(/^[/\\]/, "");
    expanded = platform === "windows"
      ? win32.join(home, rest)
      : posixJoin(home, rest);
  }

  if (platform === "windows") {
    expanded = expanded.replace(/%([^%]+)%/g, (_match, name: string) => {
      return envGet(env, name) ?? _match;
    });
  }

  return expanded;
}

export function manifestPathFor(
  configFile: string,
  platform: InstallPlatform,
): string {
  return joinFor(platform, dirnameFor(platform, configFile), MANIFEST_FILE);
}

function dirnameFor(platform: InstallPlatform, value: string): string {
  return platform === "windows" ? win32.dirname(value) : posix.dirname(value);
}

export function defaultPaths(options: PathDefaultsOptions): InstallPaths {
  const home = options.home ?? homedir();
  const env = options.env ?? process.env;
  const platform = options.platform;
  const mode = options.mode;

  if (platform === "windows") {
    const programFiles =
      envGet(env, "ProgramFiles") ??
      envGet(env, "ProgramW6432") ??
      "C:\\Program Files";
    const programData = envGet(env, "ProgramData") ?? "C:\\ProgramData";
    const localAppData =
      envGet(env, "LOCALAPPDATA") ??
      envGet(env, "USERPROFILE") ??
      home;

    if (mode === "system") {
      const installDir = win32.join(programFiles, "Funnel");
      const configFile = win32.join(programData, "Funnel", "funnel.env");
      return {
        installDir,
        configFile,
        dataDir: win32.join(programData, "Funnel", "data"),
        logDir: win32.join(programData, "Funnel", "logs"),
        manifestPath: win32.join(programData, "Funnel", MANIFEST_FILE),
      };
    }

    const installDir = win32.join(localAppData, "Funnel");
    const configFile = win32.join(installDir, "funnel.env");
    return {
      installDir,
      configFile,
      dataDir: win32.join(installDir, "data"),
      logDir: win32.join(installDir, "logs"),
      manifestPath: win32.join(installDir, MANIFEST_FILE),
    };
  }

  if (platform === "macos") {
    if (mode === "system") {
      const base = "/Library/Application Support/Funnel";
      return {
        installDir: "/usr/local/bin",
        configFile: posixJoin(base, "funnel.env"),
        dataDir: posixJoin(base, "data"),
        logDir: "/Library/Logs/Funnel",
        manifestPath: posixJoin(base, MANIFEST_FILE),
      };
    }

    const base = posixJoin(home, "Library", "Application Support", "Funnel");
    return {
      installDir: posixJoin(home, ".local", "bin"),
      configFile: posixJoin(base, "funnel.env"),
      dataDir: posixJoin(base, "data"),
      logDir: posixJoin(home, "Library", "Logs", "Funnel"),
      manifestPath: posixJoin(base, MANIFEST_FILE),
    };
  }

  if (mode === "system") {
    return {
      installDir: "/usr/local/bin",
      configFile: "/etc/funnel/funnel.env",
      dataDir: "/var/lib/funnel",
      logDir: "/var/log/funnel",
      manifestPath: "/etc/funnel/install.json",
    };
  }

  return {
    installDir: posixJoin(home, ".local", "bin"),
    configFile: posixJoin(home, ".config", "funnel", "funnel.env"),
    dataDir: posixJoin(home, ".local", "share", "funnel"),
    logDir: posixJoin(home, ".local", "state", "funnel", "logs"),
    manifestPath: posixJoin(home, ".config", "funnel", MANIFEST_FILE),
  };
}

export function resolveInstallPaths(
  defaults: InstallPaths,
  overrides: Partial<InstallPaths>,
  platform: InstallPlatform,
  home = homedir(),
  env: Record<string, string | undefined> = process.env,
): InstallPaths {
  const resolved: InstallPaths = {
    installDir: expandPath(
      overrides.installDir ?? defaults.installDir,
      platform,
      home,
      env,
    ),
    configFile: expandPath(
      overrides.configFile ?? defaults.configFile,
      platform,
      home,
      env,
    ),
    dataDir: expandPath(
      overrides.dataDir ?? defaults.dataDir,
      platform,
      home,
      env,
    ),
    logDir: expandPath(
      overrides.logDir ?? defaults.logDir,
      platform,
      home,
      env,
    ),
    manifestPath: overrides.manifestPath ?? defaults.manifestPath,
  };
  if (overrides.configFile) {
    resolved.manifestPath = manifestPathFor(resolved.configFile, platform);
  }
  return resolved;
}

export function validateInstallPaths(
  paths: InstallPaths,
  platform: InstallPlatform,
): string[] {
  const issues: string[] = [];
  for (const [name, value] of Object.entries(paths)) {
    if (!value || !value.trim()) {
      issues.push(`${name} must not be empty.`);
      continue;
    }
    if (!isAbsolutePath(platform, value)) {
      issues.push(`${name} must be an absolute path (got ${value}).`);
    }
  }
  return issues;
}

export function defaultManifestCandidates(
  platform: InstallPlatform,
  home = homedir(),
  env: Record<string, string | undefined> = process.env,
): string[] {
  const modes: InstallMode[] =
    platform === "windows" ? ["system", "portable"] : ["system", "user"];
  const candidates = modes.map(
    (mode) => defaultPaths({ platform, mode, home, env }).manifestPath,
  );
  candidates.push(
    defaultPaths({ platform, mode: "portable", home, env }).manifestPath,
  );
  return [...new Set(candidates)];
}

export function findExistingManifest(
  platform: InstallPlatform,
  home = homedir(),
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return defaultManifestCandidates(platform, home, env).find((candidate) =>
    existsSync(candidate),
  );
}

export function currentPlatform(): InstallPlatform {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "macos";
  return "linux";
}

export function joinPath(platform: InstallPlatform, ...parts: string[]): string {
  return joinFor(platform, ...parts);
}
