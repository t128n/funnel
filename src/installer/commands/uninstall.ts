import { parseUninstallArgs, UsageError } from "../args";
import { removeBinary } from "../files";
import {
  askConfirm,
  CancelledError,
  printJson,
  step,
  success,
  warn,
} from "../ui";
import { isInteractive } from "../types";
import { loadInstall, safeRemove } from "./shared";

const HELP = `funnel uninstall

Usage: funnel uninstall [--purge] [--yes] [--manifest <path>]

Stops and removes the Funnel service or portable process. The config, database,
uploads, and logs are kept unless --purge is given.`;

export async function runUninstall(argv: string[] = []): Promise<void> {
  const args = parseUninstallArgs(argv);
  if (args.help) {
    console.log(HELP);
    return;
  }

  if (args.purge && !args.yes && !isInteractive()) {
    throw new UsageError("--purge in non-interactive mode also requires --yes.");
  }

  const { manifest, manager } = loadInstall(args.manifest);
  let purge = args.purge;

  if (purge && !args.yes && isInteractive()) {
    purge = await askConfirm(
      "Delete the configuration, database, uploads, and logs as well? This cannot be undone.",
      false,
    );
  }

  try {
    await manager.uninstall({ purge });
  } catch (error) {
    warn(
      `Service removal reported: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const removed = removeBinary(manifest);
  if (removed.pending) {
    warn(
      `The binary was still in use and was moved to ${removed.pending}. It will be deleted on the next setup or uninstall.`,
    );
  }
  safeRemove(manifest.manifestPath, manifest.platform);
  if (purge) {
    step(`Removing config: ${manifest.configFile}`);
    safeRemove(manifest.configFile, manifest.platform);
    step(`Removing data: ${manifest.dataDir}`);
    safeRemove(manifest.dataDir, manifest.platform);
    step(`Removing logs: ${manifest.logDir}`);
    safeRemove(manifest.logDir, manifest.platform);
  }

  const result = {
    ok: true,
    purged: purge,
    kept: purge
      ? []
      : [manifest.configFile, manifest.dataDir, manifest.logDir],
  };
  if (args.json) printJson(result);
  else if (purge) success("Funnel removed, including its data.");
  else {
    success("Funnel removed. Configuration and data were kept.");
    console.log(
      [
        `Config: ${manifest.configFile}`,
        `Data:   ${manifest.dataDir}`,
        `Logs:   ${manifest.logDir}`,
      ].join("\n"),
    );
  }
}

export { HELP as UNINSTALL_HELP };
