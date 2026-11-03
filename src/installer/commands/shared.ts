import { existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { readManifest } from "../config";
import {
  currentPlatform,
  defaultPaths,
  findExistingManifest,
  isAbsolutePath,
} from "../paths";
import { createServiceManager } from "../service";
import type {
  InstallConfig,
  InstallManifest,
  ServiceManager,
} from "../types";

export interface LoadedInstall {
  manifest: InstallManifest;
  config: InstallConfig;
  manager: ServiceManager;
}

export function locateManifest(explicit?: string): string | undefined {
  if (explicit) return resolve(explicit);
  return findExistingManifest(currentPlatform());
}

export function loadInstall(explicit?: string): LoadedInstall {
  const path = locateManifest(explicit);
  if (!path) {
    const fallback = defaultPaths({
      platform: currentPlatform(),
      mode: "system",
    }).manifestPath;
    throw new Error(
      `No Funnel installation manifest found. Looked for ${fallback}. Pass --manifest <path> if it is elsewhere.`,
    );
  }
  const manifest = readManifest(path);
  if (!manifest) {
    throw new Error(`Installation manifest is missing or invalid: ${path}`);
  }
  const config = configFromManifest(manifest);
  return {
    manifest,
    config,
    manager: createServiceManager(config),
  };
}

export function configFromManifest(manifest: InstallManifest): InstallConfig {
  return {
    ...manifest,
    dryRun: false,
    force: false,
    noElevate: false,
    onboardingToken: undefined,
  };
}

export function safeRemove(path: string, platform = currentPlatform()): void {
  if (!path || !isAbsolutePath(platform, path)) {
    throw new Error(`Refusing to remove a non-absolute path: ${path}`);
  }
  const normalized = resolve(path);
  if (normalized === resolve("/") || /^[A-Za-z]:[\\/]?$/.test(normalized)) {
    throw new Error(`Refusing to remove a filesystem root: ${path}`);
  }
  rmSync(path, { recursive: true, force: true });
}

export function parentExists(path: string): boolean {
  return existsSync(dirname(path));
}
