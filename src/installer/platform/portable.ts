import { closeSync, openSync } from "node:fs";
import { join } from "node:path";
import { readManifest, writeManifest } from "../config";
import { binaryPath, logFilePath } from "../files";
import { checkReadiness, waitForHealth } from "../health";
import { tailFile } from "../tail";
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
      } finally {
        closeSync(out);
        closeSync(err);
      }
    },

    async stop() {
      const current = manifest();
      const pid = current?.pid;
      if (pid && processAlive(pid)) {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          // Fall through to the forced kill below.
        }

        // The server drains in-flight requests before exiting. Give it a short
        // grace period, then force it so uninstall is not left with a live
        // process.
        const deadline = Date.now() + 5_000;
        while (Date.now() < deadline && processAlive(pid)) {
          await Bun.sleep(250);
        }
        if (processAlive(pid)) {
          if (process.platform === "win32") {
            Bun.spawnSync(["taskkill", "/PID", String(pid), "/T", "/F"]);
          } else {
            try {
              process.kill(pid, "SIGKILL");
            } catch {
              // Already gone.
            }
          }
        }
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
