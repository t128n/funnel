import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import type { InstallConfig } from "./types";

type FileConfig = Pick<
  InstallConfig,
  "installDir" | "platform" | "dataDir" | "logDir"
>;

export function binaryPath(config: FileConfig): string {
  return join(
    config.installDir,
    config.platform === "windows" ? "funnel.exe" : "funnel",
  );
}

export function logFilePath(config: FileConfig, stream = "funnel"): string {
  return join(config.logDir, `${stream}.log`);
}

export function ensureInstallDirs(config: FileConfig): void {
  for (const dir of [config.installDir, config.dataDir, config.logDir]) {
    mkdirSync(dir, { recursive: true });
  }
}

export function copySelfToInstallDir(config: FileConfig): string {
  ensureInstallDirs(config);
  const target = binaryPath(config);
  const source = resolve(process.execPath);
  if (source !== resolve(target)) {
    try {
      copyFileSync(source, target);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ETXTBSY" && code !== "EPERM" && code !== "EBUSY") {
        throw error;
      }
      // A portable process may still be running from the target. Renaming a
      // running executable is allowed on all supported platforms; the old
      // process keeps its mapped image, and the new file lands at the path.
      renameSync(target, `${target}.running-${Date.now()}`);
      copyFileSync(source, target);
    }
  }
  if (config.platform !== "windows") {
    chmodSync(target, 0o755);
  }
  return target;
}

export function removeBinary(config: FileConfig): void {
  const target = binaryPath(config);
  rmSync(target, { force: true });

  // `copySelfToInstallDir` may have renamed a running image; `upgrade` also
  // keeps `.bak-*`/`.failed-*` files. Clean those up on uninstall.
  const base = basename(target);
  if (!existsSync(config.installDir)) return;
  for (const entry of readdirSync(config.installDir)) {
    if (
      entry.startsWith(`${base}.running-`) ||
      entry.startsWith(`${base}.bak-`) ||
      entry.startsWith(`${base}.failed-`)
    ) {
      rmSync(join(config.installDir, entry), { force: true });
    }
  }
}

export function binaryExists(config: FileConfig): boolean {
  return existsSync(binaryPath(config));
}
