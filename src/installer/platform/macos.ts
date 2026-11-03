import {
  chmodSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { binaryPath, logFilePath } from "../files";
import { tailFile } from "../tail";
import type {
  DoctorCheck,
  InstallConfig,
  ServiceManager,
  ServiceStatus,
} from "../types";
import { isRoot, run, runOrThrow, type RunResult } from "./util";

export type LaunchdMode = "system" | "user";

export const MACOS_SERVICE_USER = "_funnel";
export const MACOS_SERVICE_GROUP = "_funnel";
export const SYSTEM_PLIST_DIR = "/Library/LaunchDaemons";

const SYSTEM_ID_MIN = 300;
const SYSTEM_ID_MAX = 499;

export function launchdPlistPath(
  config: Pick<InstallConfig, "launchdLabel">,
  mode: LaunchdMode,
  home = homedir(),
): string {
  const file = `${config.launchdLabel}.plist`;
  return mode === "system"
    ? join(SYSTEM_PLIST_DIR, file)
    : join(home, "Library", "LaunchAgents", file);
}

export function escapePlistXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&apos;";
    }
  });
}

function xmlString(value: string, indent: string): string {
  return `${indent}<string>${escapePlistXml(value)}</string>`;
}

/**
 * Render a LaunchDaemon (system) or LaunchAgent (user) plist. Pure: no file
 * system or `launchctl` access, so the service definition stays testable.
 */
export function renderLaunchdPlist(
  config: InstallConfig,
  mode: LaunchdMode,
): string {
  if (config.platform !== "macos") {
    throw new Error("A launchd plist can only be rendered for macOS.");
  }

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "  <key>Label</key>",
    xmlString(config.launchdLabel, "  "),
    "  <key>ProgramArguments</key>",
    "  <array>",
    xmlString(binaryPath(config), "    "),
    "  </array>",
    "  <key>WorkingDirectory</key>",
    xmlString(config.dataDir, "  "),
  ];

  if (mode === "system") {
    lines.push(
      "  <key>UserName</key>",
      xmlString(MACOS_SERVICE_USER, "  "),
      "  <key>GroupName</key>",
      xmlString(MACOS_SERVICE_GROUP, "  "),
    );
  }

  lines.push(
    "  <key>EnvironmentVariables</key>",
    "  <dict>",
    "    <key>FUNNEL_ENV_FILE</key>",
    xmlString(config.configFile, "    "),
    "    <key>FUNNEL_DATA_DIR</key>",
    xmlString(config.dataDir, "    "),
    "  </dict>",
    "  <key>RunAtLoad</key>",
    "  <true/>",
    "  <key>KeepAlive</key>",
    "  <dict>",
    "    <key>SuccessfulExit</key>",
    "    <false/>",
    "  </dict>",
    "  <key>ProcessType</key>",
    "  <string>Background</string>",
    "  <key>StandardOutPath</key>",
    xmlString(logFilePath(config), "  "),
    "  <key>StandardErrorPath</key>",
    xmlString(logFilePath(config, "funnel-error"), "  "),
    "</dict>",
    "</plist>",
    "",
  );

  return lines.join("\n");
}

function launchdDomain(mode: LaunchdMode): string {
  if (mode === "system") return "system";
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (uid === undefined) {
    throw new Error(
      "Cannot determine the current user ID for the launchd gui/<uid> domain.",
    );
  }
  return `gui/${uid}`;
}

function serviceTarget(domain: string, label: string): string {
  return `${domain}/${label}`;
}

interface AccountIds {
  users: Set<number>;
  groups: Set<number>;
}

async function listAccountIds(kind: "Users" | "Groups"): Promise<Set<number>> {
  const result = await run(["dscl", ".", "-list", `/${kind}`, "UniqueID"]);
  if (result.exitCode !== 0) return new Set();
  const ids = new Set<number>();
  for (const line of result.stdout.split("\n")) {
    const match = /\s(\d+)\s*$/.exec(line);
    if (match) ids.add(Number(match[1]));
  }
  return ids;
}

async function accountExists(
  kind: "Users" | "Groups",
  name: string,
): Promise<boolean> {
  const result = await run(["dscl", ".", "-read", `/${kind}/${name}`]);
  return result.exitCode === 0;
}

export async function serviceUserExists(): Promise<boolean> {
  return accountExists("Users", MACOS_SERVICE_USER);
}

export async function serviceGroupExists(): Promise<boolean> {
  return accountExists("Groups", MACOS_SERVICE_GROUP);
}

function pickServiceId(ids: AccountIds): number {
  for (let id = SYSTEM_ID_MAX; id >= SYSTEM_ID_MIN; id -= 1) {
    if (!ids.users.has(id) && !ids.groups.has(id)) return id;
  }
  throw new Error(
    `No free system UID/GID between ${SYSTEM_ID_MIN} and ${SYSTEM_ID_MAX}.`,
  );
}

function manualUserCommand(id: number): string {
  return [
    `sudo dscl . -create /Groups/${MACOS_SERVICE_GROUP}`,
    `sudo dscl . -create /Groups/${MACOS_SERVICE_GROUP} PrimaryGroupID ${id}`,
    `sudo dscl . -create /Users/${MACOS_SERVICE_USER}`,
    `sudo dscl . -create /Users/${MACOS_SERVICE_USER} UniqueID ${id}`,
    `sudo dscl . -create /Users/${MACOS_SERVICE_USER} PrimaryGroupID ${id}`,
    `sudo dscl . -create /Users/${MACOS_SERVICE_USER} NFSHomeDirectory /var/empty`,
    `sudo dscl . -create /Users/${MACOS_SERVICE_USER} UserShell /usr/bin/false`,
  ].join("\n  ");
}

/**
 * Ensure the dedicated system-mode service account exists. Running as root
 * would otherwise leave the daemon with far more access than it needs.
 */
export async function ensureServiceUser(): Promise<void> {
  const [hasUser, hasGroup] = await Promise.all([
    serviceUserExists(),
    serviceGroupExists(),
  ]);
  if (hasUser && hasGroup) return;

  if (!isRoot()) {
    throw new Error(
      `System mode needs the dedicated ${MACOS_SERVICE_USER} service account, but it does not exist and creating it requires administrator rights. Re-run funnel setup with sudo, or create the account manually.`,
    );
  }

  const ids: AccountIds = {
    users: await listAccountIds("Users"),
    groups: await listAccountIds("Groups"),
  };
  const id = pickServiceId(ids);

  try {
    if (!hasGroup) {
      await runOrThrow(["dscl", ".", "-create", `/Groups/${MACOS_SERVICE_GROUP}`]);
      await runOrThrow([
        "dscl",
        ".",
        "-create",
        `/Groups/${MACOS_SERVICE_GROUP}`,
        "PrimaryGroupID",
        String(id),
      ]);
      await runOrThrow([
        "dscl",
        ".",
        "-create",
        `/Groups/${MACOS_SERVICE_GROUP}`,
        "RealName",
        "Funnel",
      ]);
    }
    if (!hasUser) {
      await runOrThrow(["dscl", ".", "-create", `/Users/${MACOS_SERVICE_USER}`]);
      await runOrThrow([
        "dscl",
        ".",
        "-create",
        `/Users/${MACOS_SERVICE_USER}`,
        "UniqueID",
        String(id),
      ]);
      await runOrThrow([
        "dscl",
        ".",
        "-create",
        `/Users/${MACOS_SERVICE_USER}`,
        "PrimaryGroupID",
        String(id),
      ]);
      await runOrThrow([
        "dscl",
        ".",
        "-create",
        `/Users/${MACOS_SERVICE_USER}`,
        "RealName",
        "Funnel",
      ]);
      await runOrThrow([
        "dscl",
        ".",
        "-create",
        `/Users/${MACOS_SERVICE_USER}`,
        "NFSHomeDirectory",
        "/var/empty",
      ]);
      await runOrThrow([
        "dscl",
        ".",
        "-create",
        `/Users/${MACOS_SERVICE_USER}`,
        "UserShell",
        "/usr/bin/false",
      ]);
      await runOrThrow([
        "dscl",
        ".",
        "-create",
        `/Users/${MACOS_SERVICE_USER}`,
        "IsHidden",
        "1",
      ]);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not create the ${MACOS_SERVICE_USER} service account: ${detail}. Create it manually and re-run funnel setup:\n  ${manualUserCommand(id)}`,
    );
  }

  if (!(await serviceUserExists()) || !(await serviceGroupExists())) {
    throw new Error(
      `The ${MACOS_SERVICE_USER} service account was not created correctly. Create it manually and re-run funnel setup:\n  ${manualUserCommand(id)}`,
    );
  }
}

async function assignSystemOwnership(config: InstallConfig): Promise<void> {
  const owner = `${MACOS_SERVICE_USER}:${MACOS_SERVICE_GROUP}`;
  await runOrThrow(["chown", "-R", owner, config.dataDir]);
  await runOrThrow(["chown", "-R", owner, config.logDir]);
  // The daemon must read the env file; keep it out of reach of other users.
  if (existsSync(config.configFile)) {
    await runOrThrow(["chown", `root:${MACOS_SERVICE_GROUP}`, config.configFile]);
    await runOrThrow(["chmod", "0640", config.configFile]);
  }
}

function launchctlError(args: string[], result: RunResult): Error {
  const output = [result.stderr.trim(), result.stdout.trim()]
    .filter(Boolean)
    .join(" ");
  return new Error(
    `launchctl ${args.join(" ")} failed (exit ${result.exitCode})${output ? `: ${output}` : ""}`,
  );
}

function isUnloadedFailure(result: RunResult): boolean {
  const text = `${result.stdout}\n${result.stderr}`.toLowerCase();
  return /no such process|no such file|could not find|not found/.test(text);
}

async function bootout(domain: string, label: string): Promise<RunResult> {
  return run(["launchctl", "bootout", serviceTarget(domain, label)]);
}

async function printJob(domain: string, label: string): Promise<RunResult> {
  return run(["launchctl", "print", serviceTarget(domain, label)]);
}

async function isJobDisabled(
  domain: string,
  label: string,
): Promise<boolean> {
  const result = await run(["launchctl", "print-disabled", domain]);
  if (result.exitCode !== 0) return false;
  return result.stdout.split("\n").some((line) => {
    return line.includes(`"${label}"`) && /=>\s*true\b/.test(line);
  });
}

export function createMacosServiceManager(config: InstallConfig): ServiceManager {
  if (config.mode === "portable") {
    throw new Error(
      "Portable mode does not use launchd. Choose --mode system or --mode user, or run the Funnel binary directly.",
    );
  }

  const mode: LaunchdMode = config.mode === "system" ? "system" : "user";
  const plistPath = launchdPlistPath(config, mode);
  const domain = launchdDomain(mode);
  const target = serviceTarget(domain, config.launchdLabel);

  async function install(): Promise<void> {
    if (mode === "system") await ensureServiceUser();

    mkdirSync(dirname(plistPath), { recursive: true });
    mkdirSync(config.dataDir, { recursive: true });
    mkdirSync(config.logDir, { recursive: true });
    if (mode === "system") await assignSystemOwnership(config);

    writeFileSync(plistPath, renderLaunchdPlist(config, mode), {
      encoding: "utf8",
      mode: 0o644,
    });
    // launchd refuses plists that are writable by group or others.
    chmodSync(plistPath, 0o644);

    // Re-installing over a loaded job must not fail on the bootstrap.
    await bootout(domain, config.launchdLabel);
    await runOrThrow(["launchctl", "bootstrap", domain, plistPath]);
    await runOrThrow(["launchctl", "enable", target]);
    await runOrThrow(["launchctl", "kickstart", "-k", target]);
  }

  async function start(): Promise<void> {
    const printed = await printJob(domain, config.launchdLabel);
    if (printed.exitCode !== 0) {
      if (!existsSync(plistPath)) {
        throw new Error(
          `Funnel is not installed for launchd (missing ${plistPath}). Run funnel setup first.`,
        );
      }
      await runOrThrow(["launchctl", "bootstrap", domain, plistPath]);
    }
    await runOrThrow(["launchctl", "enable", target]);
    await runOrThrow(["launchctl", "kickstart", "-k", target]);
  }

  async function stop(): Promise<void> {
    const result = await bootout(domain, config.launchdLabel);
    if (result.exitCode !== 0 && !isUnloadedFailure(result)) {
      throw launchctlError(
        ["bootout", target],
        result,
      );
    }
  }

  async function restart(): Promise<void> {
    const printed = await printJob(domain, config.launchdLabel);
    if (printed.exitCode !== 0) {
      await start();
      return;
    }
    await runOrThrow(["launchctl", "kickstart", "-k", target]);
  }

  async function status(): Promise<ServiceStatus> {
    const installedOnDisk = existsSync(plistPath);
    const printed = await printJob(domain, config.launchdLabel);
    if (printed.exitCode !== 0) {
      return {
        installed: installedOnDisk,
        running: false,
        enabled: false,
        detail: installedOnDisk
          ? `launchd job ${config.launchdLabel} is not loaded`
          : `launchd job ${config.launchdLabel} is not installed`,
      };
    }

    const state = /^\s*state = (.+)$/m.exec(printed.stdout)?.[1].trim();
    const pidText = /^\s*pid = (\d+)$/m.exec(printed.stdout)?.[1];
    const running = state === "running";
    const disabled = await isJobDisabled(domain, config.launchdLabel);
    const detail = state
      ? `launchd ${config.launchdLabel} is ${state}${pidText ? ` (pid ${pidText})` : ""}`
      : `launchd ${config.launchdLabel} is loaded`;

    return {
      installed: true,
      running,
      enabled: !disabled,
      pid: pidText ? Number(pidText) : undefined,
      detail,
    };
  }

  async function uninstall(): Promise<void> {
    const result = await bootout(domain, config.launchdLabel);
    if (result.exitCode !== 0 && !isUnloadedFailure(result)) {
      throw launchctlError(["bootout", target], result);
    }
    // The shared uninstall command removes config, data, and logs on --purge.
    rmSync(plistPath, { force: true });
  }

  async function logs(options: {
    follow: boolean;
    lines: number;
  }): Promise<void> {
    await tailFile(logFilePath(config), options);
  }

  async function doctorChecks(): Promise<DoctorCheck[]> {
    const checks: DoctorCheck[] = [
      {
        name: "launchd plist",
        state: existsSync(plistPath) ? "ok" : "fail",
        detail: plistPath,
      },
    ];

    const printed = await printJob(domain, config.launchdLabel);
    checks.push({
      name: "launchd job",
      state: printed.exitCode === 0 ? "ok" : "fail",
      detail:
        printed.exitCode === 0
          ? target
          : `not loaded (${target})`,
    });

    if (mode === "system") {
      const account = await serviceUserExists();
      checks.push({
        name: `${MACOS_SERVICE_USER} service account`,
        state: account ? "ok" : "fail",
        detail: account
          ? MACOS_SERVICE_USER
          : `missing; system mode needs the dedicated ${MACOS_SERVICE_USER} account`,
      });
    }

    return checks;
  }

  return {
    kind: "launchd",
    install,
    start,
    stop,
    restart,
    status,
    uninstall,
    logs,
    doctorChecks,
  };
}
