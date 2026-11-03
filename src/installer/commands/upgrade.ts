import { copyFileSync, existsSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import { parseUpgradeArgs, UsageError } from "../args";
import { writeManifest } from "../config";
import { binaryPath } from "../files";
import { waitForHealth } from "../health";
import { runSync } from "../platform/util";
import { printJson, success, step, warn } from "../ui";
import { VERSION } from "../version";
import { loadInstall } from "./shared";

const HELP = `funnel upgrade

Usage: funnel upgrade --binary <path> [--yes] [--manifest <path>]
       funnel upgrade --check

Installs a downloaded Funnel binary over the current installation, restarts the
service, and rolls back if the new binary fails its health check. The private
repository means the supported path is a locally downloaded binary.`;

function readVersion(binary: string): string | undefined {
  const result = runSync([binary, "--version"]);
  if (result.exitCode !== 0) return undefined;
  const value = result.stdout.trim().split(/\s+/).pop();
  return value || undefined;
}

export async function runUpgrade(argv: string[] = []): Promise<void> {
  const args = parseUpgradeArgs(argv);
  if (args.help) {
    console.log(HELP);
    return;
  }

  const { manifest, manager } = loadInstall(args.manifest);

  if (args.check) {
    const report = {
      current: manifest.version,
      binary: binaryPath(manifest),
      requested: args.version ?? null,
      action:
        "Download the platform binary from the GitHub release and run: funnel upgrade --binary <path>",
    };
    if (args.json) printJson(report);
    else {
      console.log(`Current version: ${manifest.version}`);
      if (args.version) console.log(`Requested version: ${args.version}`);
      console.log("The repository is private; automatic release lookup needs a token.");
      console.log(
        "Download the matching binary from the release page, then run: funnel upgrade --binary <path>",
      );
    }
    return;
  }

  if (!args.binary) {
    throw new UsageError("--binary <path> is required (or use --check).");
  }

  const source = resolve(args.binary);
  if (!existsSync(source)) {
    throw new UsageError(`Binary not found: ${source}`);
  }

  const target = binaryPath(manifest);
  if (resolve(target) === source) {
    throw new UsageError("The source and installed binary are the same file.");
  }

  step(`Stopping Funnel ${manifest.version}...`);
  await manager.stop();

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = `${target}.bak-${stamp}`;
  let movedOld = false;
  try {
    if (existsSync(target)) {
      renameSync(target, backup);
      movedOld = true;
    }
    // Windows cannot replace a running image in place; the service is stopped
    // and the old binary has already been renamed.
    copyFileSync(source, target);
    if (process.platform !== "win32") {
      Bun.spawnSync(["chmod", "755", target]);
    }

    step("Starting the new binary...");
    await manager.start();
    const health = await waitForHealth(manifest.port, 45_000);
    if (!health.ok) {
      throw new Error(
        `New binary failed its health check: ${health.detail ?? "unknown"}`,
      );
    }

    const discovered = readVersion(target);
    writeManifest(manifest.manifestPath, {
      ...manifest,
      version: discovered ?? args.version ?? manifest.version,
      installedAt: new Date().toISOString(),
      pid: undefined,
    });

    success(
      `Upgraded Funnel from ${manifest.version} to ${discovered ?? args.version ?? "the new build"}.`,
    );
    step(`Previous binary kept at ${backup}`);
    if (args.json) {
      printJson({ ok: true, from: manifest.version, to: discovered, backup });
    }
  } catch (error) {
    warn(
      `Upgrade failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    try {
      await manager.stop();
    } catch {
      // Best effort.
    }
    if (movedOld && existsSync(backup)) {
      try {
        if (existsSync(target)) {
          renameSync(target, `${target}.failed-${stamp}`);
        }
        renameSync(backup, target);
        await manager.start();
        warn("Rolled back to the previous binary.");
      } catch (rollbackError) {
        warn(
          `Rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
        );
      }
    }
    throw error;
  }
}

export { HELP as UPGRADE_HELP };
