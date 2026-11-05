import {
  chmodSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, userInfo } from "node:os";
import { dirname, posix } from "node:path";
import { binaryPath, logFilePath } from "../files";
import { tailFile } from "../tail";
import type {
  DoctorCheck,
  InstallConfig,
  InstallMode,
  ServiceManager,
  ServiceStatus,
} from "../types";
import {
  ensureTrailingNewline,
  isRoot,
  run,
  runOrThrow,
  type RunResult,
} from "./util";

/** systemd gained `StandardOutput=append:` in v240. */
export const SYSTEMD_APPEND_MIN_VERSION = 240;

const SYSTEM_USER = "funnel";
const SYSTEM_GROUP = "funnel";

type SystemdMode = Exclude<InstallMode, "portable">;

interface RenderOptions {
  /**
   * Whether the installed systemd understands `append:` log targets. Defaults
   * to assuming support; callers that can query systemd should pass the
   * detected value.
   */
  append?: boolean;
}

function assertSystemdMode(config: InstallConfig): asserts config is InstallConfig & {
  mode: SystemdMode;
} {
  if (config.mode === "portable") {
    throw new Error(
      "Portable mode does not use systemd. Use the portable service manager instead.",
    );
  }
}

function unitName(config: InstallConfig): string {
  return `${config.serviceName}.service`;
}

/**
 * Quote a value for a systemd unit file. systemd has its own quoting rules
 * (double quotes with C-style escapes), so shell quoting must not be reused
 * here.
 */
export function systemdQuote(value: string): string {
  if (!/[\s"'\\%$]/.test(value)) return value;
  return `"${value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("%", "%%")
    .replaceAll("$", "$$")}"`;
}

export function systemdUnitPath(
  config: InstallConfig,
  home = homedir(),
): string {
  assertSystemdMode(config);
  if (config.mode === "system") {
    return `/etc/systemd/system/${unitName(config)}`;
  }
  return posix.join(home, ".config", "systemd", "user", unitName(config));
}

export function renderSystemdUnit(
  config: InstallConfig,
  mode: InstallMode = config.mode,
  options: RenderOptions = {},
): string {
  const effectiveMode: InstallMode = mode;
  if (effectiveMode === "portable") {
    throw new Error(
      "Portable mode does not use systemd. Use the portable service manager instead.",
    );
  }

  const system = effectiveMode === "system";
  const fileLogging = config.logMode === "file" && options.append !== false;
  const lines = [
    "[Unit]",
    "Description=Funnel",
    "After=network-online.target",
    "Wants=network-online.target",
    "",
    "[Service]",
    "Type=simple",
  ];

  if (system) {
    lines.push(`User=${SYSTEM_USER}`, `Group=${SYSTEM_GROUP}`);
  }

  lines.push(
    `WorkingDirectory=${systemdQuote(config.dataDir)}`,
    `Environment=${systemdQuote(`FUNNEL_ENV_FILE=${config.configFile}`)}`,
    `Environment=${systemdQuote(`FUNNEL_DATA_DIR=${config.dataDir}`)}`,
    `ExecStart=${systemdQuote(binaryPath(config))}`,
    "Restart=on-failure",
    "RestartSec=5",
    "TimeoutStopSec=35",
    "NoNewPrivileges=true",
    "PrivateTmp=true",
  );

  if (system) {
    lines.push("ProtectSystem=strict", "ProtectHome=true");
  }

  const writable = [config.dataDir];
  if (fileLogging && config.logDir !== config.dataDir) {
    writable.push(config.logDir);
  }
  lines.push(
    `ReadWritePaths=${writable
      .map((path) => systemdQuote(path))
      .join(" ")}`,
  );

  if (fileLogging) {
    lines.push(
      `StandardOutput=${systemdQuote(`append:${logFilePath(config)}`)}`,
      `StandardError=${systemdQuote(`append:${logFilePath(config, "funnel-error")}`)}`,
    );
  }

  lines.push(
    "",
    "[Install]",
    `WantedBy=${system ? "multi-user.target" : "default.target"}`,
  );

  return ensureTrailingNewline(lines.join("\n"));
}

export function parseSystemdVersion(output: string): number | undefined {
  const match = /systemd\s+(\d+)/i.exec(output);
  return match ? Number(match[1]) : undefined;
}

async function tryRun(command: string[]): Promise<RunResult> {
  try {
    return await run(command);
  } catch (error) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function systemdAppendSupported(): Promise<boolean> {
  const result = await tryRun(["systemctl", "--version"]);
  if (result.exitCode !== 0) return false;
  const version = parseSystemdVersion(result.stdout);
  return version !== undefined && version >= SYSTEMD_APPEND_MIN_VERSION;
}

function systemctl(config: InstallConfig, ...args: string[]): string[] {
  return config.mode === "user"
    ? ["systemctl", "--user", ...args]
    : ["systemctl", ...args];
}

function journalctl(config: InstallConfig, ...args: string[]): string[] {
  return config.mode === "user"
    ? ["journalctl", "--user", ...args]
    : ["journalctl", ...args];
}

function currentUser(): string | undefined {
  return process.env.USER || process.env.LOGNAME || userInfo().username;
}

async function ensureSystemUser(config: InstallConfig): Promise<void> {
  if (config.mode !== "system") return;

  const groupExists = (await run(["getent", "group", SYSTEM_GROUP])).exitCode === 0;
  if (!groupExists) {
    await runOrThrow(["groupadd", "--system", SYSTEM_GROUP]);
  }

  const userExists = (await run(["id", "-u", SYSTEM_USER])).exitCode === 0;
  if (!userExists) {
    await runOrThrow([
      "useradd",
      "--system",
      "--gid",
      SYSTEM_GROUP,
      "--no-create-home",
      "--home-dir",
      config.dataDir,
      "--shell",
      "/usr/sbin/nologin",
      SYSTEM_USER,
    ]);
  }
}

async function prepareDirectories(config: InstallConfig): Promise<void> {
  mkdirSync(config.dataDir, { recursive: true });
  if (config.logMode === "file") {
    mkdirSync(config.logDir, { recursive: true });
  }

  if (config.mode === "system" && isRoot()) {
    // Best effort: an existing install may carry root-owned files.
    for (const dir of [config.dataDir, config.logDir]) {
      if (existsSync(dir)) {
        await run(["chown", `${SYSTEM_USER}:${SYSTEM_GROUP}`, dir]);
      }
    }

    // The shared writer creates the env file as 0600 root:root, which the
    // unprivileged service user could not read.
    if (existsSync(config.configFile)) {
      try {
        chmodSync(config.configFile, 0o640);
      } catch {
        // Surface permission problems through doctor/log output instead.
      }
      await run(["chown", `root:${SYSTEM_GROUP}`, config.configFile]);
    }
  }
}

async function enableLinger(): Promise<string | undefined> {
  const user = currentUser();
  if (!user) {
    return "Could not determine the current user; loginctl enable-linger was skipped.";
  }

  const result = await tryRun(["loginctl", "enable-linger", user]);
  if (result.exitCode === 0) return undefined;

  const detail = result.stderr.trim() || `exit ${result.exitCode}`;
  console.warn(
    `Warning: could not enable lingering for ${user} (${detail}). The service will start at login instead of boot; run "loginctl enable-linger ${user}" later.`,
  );
  return `Could not enable lingering for ${user} (${detail}). The service will start at login instead of boot.`;
}

export function createLinuxServiceManager(config: InstallConfig): ServiceManager {
  assertSystemdMode(config);

  const unit = unitName(config);
  const path = systemdUnitPath(config);
  let fileLogFallbackNote: string | undefined;
  let lingerWarning: string | undefined;

  async function status(): Promise<ServiceStatus> {
    const installed = existsSync(path);
    if (!installed) {
      return {
        installed: false,
        running: false,
        enabled: false,
        detail: `${unit} is not installed`,
      };
    }

    const [enabledResult, activeResult] = await Promise.all([
      tryRun(systemctl(config, "is-enabled", unit)),
      tryRun(systemctl(config, "is-active", unit)),
    ]);

    const enabled = enabledResult.stdout.trim().startsWith("enabled");
    const activeState = activeResult.stdout.trim() || "unknown";
    const running = activeState === "active";

    let pid: number | undefined;
    if (running) {
      const show = await tryRun(
        systemctl(config, "show", "-p", "MainPID", unit),
      );
      const match = /MainPID=(\d+)/.exec(show.stdout);
      const parsed = match ? Number(match[1]) : 0;
      if (parsed > 0) pid = parsed;
    }

    const state = running ? "active" : activeState;
    return {
      installed: true,
      running,
      enabled,
      pid,
      detail: `systemd ${config.mode} unit ${unit} is ${state}${enabled ? " (enabled)" : ""}`,
    };
  }

  return {
    kind: "systemd",

    async install() {
      await ensureSystemUser(config);
      await prepareDirectories(config);

      const append = config.logMode === "file" ? await systemdAppendSupported() : false;
      if (config.logMode === "file" && !append) {
        fileLogFallbackNote =
          "This systemd does not support append: log targets; service logs go to the journal.";
        console.warn(`Warning: ${fileLogFallbackNote}`);
      }

      const unitPath = systemdUnitPath(config);
      mkdirSync(dirname(unitPath), { recursive: true });
      writeFileSync(
        unitPath,
        renderSystemdUnit(config, config.mode, { append }),
        { encoding: "utf8", mode: 0o644 },
      );

      await runOrThrow(systemctl(config, "daemon-reload"));
      await runOrThrow(systemctl(config, "enable", unit));

      if (config.mode === "user") {
        lingerWarning = await enableLinger();
      }
    },

    async start() {
      await runOrThrow(systemctl(config, "start", unit));
    },

    async stop() {
      // Stopping an absent or already-stopped unit is not an error.
      await tryRun(systemctl(config, "stop", unit));
    },

    async restart() {
      await runOrThrow(systemctl(config, "restart", unit));
    },

    status,

    async uninstall(_options) {
      await tryRun(systemctl(config, "stop", unit));
      await tryRun(systemctl(config, "disable", unit));
      rmSync(path, { force: true });
      await tryRun(systemctl(config, "daemon-reload"));

      // Config, data, and logs are kept for the shared uninstall command.
      fileLogFallbackNote = undefined;
      lingerWarning = undefined;
    },

    async logs(options) {
      if (config.logMode === "file") {
        const log = logFilePath(config);
        const supported = existsSync(log) || (await systemdAppendSupported());
        if (supported) {
          await tailFile(log, options);
          return;
        }
      }

      const args = [
        ...journalctl(config),
        "-u",
        unit,
        "-n",
        String(Math.max(1, options.lines)),
      ];
      if (options.follow) {
        args.push("-f");
      } else {
        args.push("--no-pager");
      }
      const child = Bun.spawn(args, {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      });
      await child.exited;
    },

    async doctorChecks(): Promise<DoctorCheck[]> {
      const checks: DoctorCheck[] = [];
      const versionResult = await tryRun(["systemctl", "--version"]);
      const versionLine = versionResult.stdout.split("\n")[0]?.trim();

      checks.push({
        name: "systemd",
        state: versionResult.exitCode === 0 ? "ok" : "fail",
        detail:
          versionResult.exitCode === 0
            ? versionLine || "systemctl available"
            : versionResult.stderr.trim() || "systemctl is not available",
      });

      const installed = existsSync(path);
      checks.push({
        name: "systemd unit",
        state: installed ? "ok" : "fail",
        detail: installed ? path : `Missing ${path}`,
      });

      if (config.mode === "system") {
        const userResult = await tryRun(["id", "-u", SYSTEM_USER]);
        checks.push({
          name: "Service user",
          state: userResult.exitCode === 0 ? "ok" : "warn",
          detail:
            userResult.exitCode === 0
              ? `${SYSTEM_USER} exists`
              : `${SYSTEM_USER} does not exist; the service cannot start`,
        });
      }

      if (config.logMode === "file") {
        const supported = await systemdAppendSupported();
        checks.push({
          name: "File logging",
          state: supported ? "ok" : "warn",
          detail: supported
            ? logFilePath(config)
            : (fileLogFallbackNote ??
              "This systemd does not support append: log targets; logs go to the journal."),
        });
      }

      if (config.mode === "user") {
        const user = currentUser();
        if (user) {
          const lingerResult = await tryRun([
            "loginctl",
            "show-user",
            user,
            "--property=Linger",
          ]);
          const lingerEnabled = /Linger=yes/.test(lingerResult.stdout);
          checks.push({
            name: "User lingering",
            state: lingerEnabled ? "ok" : "warn",
            detail: lingerEnabled
              ? `enabled for ${user}`
              : (lingerWarning ??
                `not enabled for ${user}; the service starts at login instead of boot`),
          });
        }
      }

      return checks;
    },
  };
}
