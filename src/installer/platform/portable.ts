import { closeSync, openSync, readdirSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import { readManifest, writeManifest } from "../config";
import { binaryPath, logFilePath } from "../files";
import { checkReadiness, waitForHealth } from "../health";
import { readTail, tailFile } from "../tail";
import { quotePowerShell, runSync } from "./util";
import type {
  InstallConfig,
  ServiceManager,
  ServiceStatus,
} from "../types";

function processAlive(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isInstalledImage(candidate: string, binary: string): boolean {
  const clean = candidate.replace(/ \(deleted\)$/, "").trim();
  if (!clean) return false;
  if (process.platform === "win32") {
    const left = clean.replaceAll("/", "\\").toLowerCase();
    const right = binary.replaceAll("/", "\\").toLowerCase();
    return left === right || left.startsWith(`${right}.`);
  }
  return clean === binary || clean.startsWith(`${binary}.`);
}

/** Whether the process behind `pid` runs the installed image. */
function pidIsInstalledImage(pid: number, binary: string): boolean {
  if (process.platform === "win32") {
    const cim = runSync([
      "powershell",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" -ErrorAction SilentlyContinue).ExecutablePath`,
    ]);
    if (cim.exitCode === 0) {
      const executable = cim.stdout.trim();
      if (executable) return isInstalledImage(executable, binary);
    }

    // CIM unavailable: fall back to the image name.
    const result = runSync([
      "tasklist",
      "/FI",
      `PID eq ${pid}`,
      "/FO",
      "CSV",
      "/NH",
    ]);
    const name = /^"([^"]+)"/m.exec(result.stdout)?.[1] ?? "";
    return /^funnel(\.exe)?$/i.test(name);
  }

  if (process.platform === "linux") {
    try {
      return isInstalledImage(readlinkSync(`/proc/${pid}/exe`), binary);
    } catch {
      return false;
    }
  }

  const comm = runSync(["ps", "-p", String(pid), "-o", "comm="]).stdout.trim();
  return isInstalledImage(comm, binary);
}

/**
 * Processes still running the installed image (including images renamed by
 * `copySelfToInstallDir`, e.g. `funnel.exe.running-…`). The manifest PID is
 * enough in the normal case, but older setup versions could clear it before
 * stopping the process; scanning by image path recovers that state.
 */
function strayPids(binary: string): number[] {
  if (process.platform === "win32") {
    const script = [
      `$binary = ${quotePowerShell(binary)}`,
      `Get-CimInstance Win32_Process -Filter "Name LIKE 'funnel%'" -ErrorAction SilentlyContinue |`,
      `  Where-Object { $_.ExecutablePath -and ($_.ExecutablePath -ieq $binary -or $_.ExecutablePath.StartsWith($binary + '.', [System.StringComparison]::OrdinalIgnoreCase)) } |`,
      `  ForEach-Object { $_.ProcessId }`,
    ].join("\n");
    const result = runSync([
      "powershell",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      script,
    ]);
    return result.stdout
      .split(/\r?\n/)
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  }

  if (process.platform === "linux") {
    const pids: number[] = [];
    try {
      for (const entry of readdirSync("/proc")) {
        if (!/^\d+$/.test(entry)) continue;
        try {
          if (isInstalledImage(readlinkSync(`/proc/${entry}/exe`), binary)) {
            pids.push(Number(entry));
          }
        } catch {
          // Process exited while we were looking at it.
        }
      }
    } catch {
      // No procfs; fall through with an empty list.
    }
    return pids;
  }

  const pids: number[] = [];
  const listing = runSync(["ps", "-axo", "pid=,comm="]);
  for (const line of listing.stdout.split(/\r?\n/)) {
    const match = /^\s*(\d+)\s+(.+)$/.exec(line);
    if (match && isInstalledImage(match[2], binary)) {
      pids.push(Number(match[1]));
    }
  }
  return pids;
}

async function terminate(pid: number): Promise<void> {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }

  if (process.platform === "win32") {
    if (processAlive(pid)) {
      Bun.spawnSync(["taskkill", "/PID", String(pid), "/T", "/F"]);
    }
    return;
  }

  // The server drains in-flight requests before exiting. Give it a short
  // grace period, then force it so uninstall is not left with a live process.
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline && processAlive(pid)) {
    await Bun.sleep(250);
  }
  if (processAlive(pid)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Already gone.
    }
  }
}

export function createPortableServiceManager(
  config: InstallConfig,
): ServiceManager {
  function manifest() {
    return readManifest(config.manifestPath);
  }

  return {
    kind: "portable",

    async install() {
      // The setup command copies the binary and writes the env file.
    },

    async start() {
      const previous = manifest();
      if (previous?.pid && processAlive(previous.pid)) {
        await this.stop();
      }
      const log = logFilePath(config);
      const errLog = logFilePath(config, "funnel-error");
      const out = openSync(log, "a");
      const err = openSync(errLog, "a");
      try {
        const child = Bun.spawn({
          cmd: [binaryPath(config)],
          cwd: config.dataDir,
          env: {
            ...process.env,
            FUNNEL_ENV_FILE: config.configFile,
            FUNNEL_DATA_DIR: config.dataDir,
            PORT: String(config.port),
            HOST: config.host,
          },
          stdin: "ignore",
          stdout: out,
          stderr: err,
          detached: true,
        });
        child.unref();
        const current = manifest();
        if (current) {
          writeManifest(config.manifestPath, { ...current, pid: child.pid });
        }

        // A child that cannot bind its port (for example because a previous
        // instance is still running) or dies while loading its config exits
        // within a few hundred milliseconds. Surface its log immediately
        // instead of waiting for a health check that can never succeed.
        const early = await Promise.race([
          child.exited.then((code) => ({ exited: true as const, code })),
          Bun.sleep(750).then(() => ({ exited: false as const })),
        ]);
        if (early.exited) {
          if (current) {
            writeManifest(config.manifestPath, { ...current, pid: undefined });
          }
          const tail = [readTail(errLog, 15), readTail(log, 15)]
            .filter((value): value is string => Boolean(value))
            .join("\n");
          throw new Error(
            `Funnel exited immediately after starting (exit code ${early.code}). ` +
              `Another process may already be using port ${config.port}.` +
              (tail ? `\n\n${tail}` : `\n\nCheck the log at ${errLog}.`),
          );
        }
      } finally {
        closeSync(out);
        closeSync(err);
      }
    },

    async stop() {
      const current = manifest();
      const pid = current?.pid;
      const target = binaryPath(config);
      const strays = strayPids(target).filter((value) => value !== process.pid);

      // Only signal the manifest PID when it still runs the installed image.
      // After a crash the PID may have been reused by an unrelated process.
      if (pid && processAlive(pid) && pidIsInstalledImage(pid, target)) {
        await terminate(pid);
      }

      // The PID can also be missing or stale (older setup versions cleared the
      // manifest before stopping). Stop anything still running from the
      // install directory so the port is released and the image can be
      // replaced.
      for (const stray of strays) {
        if (stray !== pid) await terminate(stray);
      }

      if (current) {
        writeManifest(config.manifestPath, { ...current, pid: undefined });
      }
    },

    async restart() {
      await this.stop();
      await this.start();
    },

    async status(): Promise<ServiceStatus> {
      const current = manifest();
      if (!current) {
        return { installed: false, running: false, enabled: false };
      }
      const running =
        processAlive(current.pid) || (await waitForHealth(config.port, 1_000)).ok;
      return {
        installed: true,
        running,
        enabled: false,
        pid: current.pid,
        detail: running ? "portable process" : "not running",
      };
    },

    async uninstall() {
      await this.stop();
    },

    async logs(options) {
      await tailFile(logFilePath(config), options);
    },
  };
}

/** Kept for status commands that only have a manifest. */
export async function portableHealth(port: number) {
  return checkReadiness(port);
}

export function portableLogPath(dataDir: string, logDir: string): string {
  return join(logDir, "funnel.log");
}
