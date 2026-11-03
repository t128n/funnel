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

  // Images renamed by an interrupted setup or a previous uninstall are no
  // longer mapped once the old process is gone.
  sweepImages(config, ["running", "removed"]);
  return target;
}

type ImageKind = "running" | "bak" | "failed" | "removed";

function sweepImages(config: FileConfig, kinds: ImageKind[]): void {
  const base = basename(binaryPath(config));
  if (!existsSync(config.installDir)) return;
  for (const entry of readdirSync(config.installDir)) {
    const matches = kinds.some((kind) =>
      entry.startsWith(`${base}.${kind}-`),
    );
    if (!matches) continue;
    try {
      rmSync(join(config.installDir, entry), { force: true });
    } catch {
      // Still mapped by a process that has not exited yet. The next
      // setup/uninstall sweeps it again.
    }
  }
}

export interface RemoveBinaryResult {
  /**
   * Set when the image was still mapped by a process and had to be moved
   * aside. The tombstone is deleted on the next run.
   */
  pending?: string;
}

function isLockedFileError(errorValue: unknown): boolean {
  const code = (errorValue as NodeJS.ErrnoException)?.code;
  if (
    code === "EFAULT" ||
    code === "EPERM" ||
    code === "EBUSY" ||
    code === "EACCES"
  ) {
    return true;
  }
  // Bun does not always attach `code` on Windows; the message still carries it.
  return /EFAULT|EPERM|EBUSY|EACCES|being used by another process/i.test(
    errorValue instanceof Error ? errorValue.message : String(errorValue),
  );
}

/**
 * Windows keeps an executable's image mapped for a moment after the process
 * exits, and Bun surfaces the sharing violation as EFAULT. Retry briefly, then
 * rename the file out of the canonical path (renaming a running image works
 * on every supported platform) so a reinstall can proceed.
 */
function removeOrMoveAside(path: string): string | undefined {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      rmSync(path, { force: true });
      return undefined;
    } catch (errorValue) {
      lastError = errorValue;
      if (!isLockedFileError(errorValue)) throw errorValue;
      if (attempt < 4) Bun.sleepSync(100 * 2 ** attempt);
    }
  }

  const movedTo = `${path}.removed-${Date.now()}`;
  try {
    renameSync(path, movedTo);
  } catch {
    const detail =
      lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(
      `Could not remove ${path} because it is still in use. Stop the Funnel process and try again. (${detail})`,
    );
  }
  try {
    rmSync(movedTo, { force: true });
    return undefined;
  } catch {
    return movedTo;
  }
}

export function removeBinary(config: FileConfig): RemoveBinaryResult {
  const target = binaryPath(config);
  let pending: string | undefined;
  if (existsSync(target)) {
    pending = removeOrMoveAside(target);
  }

  // `copySelfToInstallDir` may have renamed a running image; `upgrade` also
  // keeps `.bak-*`/`.failed-*` files, and a locked binary is moved to
  // `.removed-*` above. Clean all of them up on uninstall.
  sweepImages(config, ["running", "bak", "failed", "removed"]);
  return { pending };
}

export function binaryExists(config: FileConfig): boolean {
  return existsSync(binaryPath(config));
}
