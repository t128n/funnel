/**
 * Shared contracts for `funnel setup` and the lifecycle commands.
 *
 * Keep this module free of Node/Bun side effects: platform adapters and unit
 * tests import it directly.
 */

export type InstallPlatform = "linux" | "macos" | "windows";
export type InstallMode = "system" | "user" | "portable";
export type LogMode = "journald" | "file";

export interface InstallPaths {
  installDir: string;
  configFile: string;
  dataDir: string;
  logDir: string;
  manifestPath: string;
}

export interface InstallConfig extends InstallPaths {
  version: string;
  platform: InstallPlatform;
  mode: InstallMode;
  port: number;
  host: string;
  url: string;
  onboardingToken?: string;
  logLevel: string;
  logMode: LogMode;
  force: boolean;
  dryRun: boolean;
  noElevate: boolean;
  serviceName: string;
  launchdLabel: string;
}

export interface InstallManifest extends InstallPaths {
  version: string;
  platform: InstallPlatform;
  mode: InstallMode;
  port: number;
  host: string;
  url: string;
  logLevel: string;
  logMode: LogMode;
  serviceName: string;
  launchdLabel: string;
  installedAt: string;
  pid?: number;
}

export interface ServiceStatus {
  installed: boolean;
  running: boolean;
  enabled: boolean;
  pid?: number;
  detail?: string;
}

export interface ServiceManager {
  readonly kind: string;
  install(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  status(): Promise<ServiceStatus>;
  uninstall(options: { purge: boolean }): Promise<void>;
  logs(options: { follow: boolean; lines: number }): Promise<void>;
  doctorChecks?(): Promise<DoctorCheck[]>;
}

export type CheckState = "ok" | "warn" | "fail";

export interface DoctorCheck {
  name: string;
  state: CheckState;
  detail?: string;
}

export interface DoctorReport {
  ok: boolean;
  checks: DoctorCheck[];
}

export const DEFAULT_PORT = 3000;
export const DEFAULT_LOG_LEVEL = "info";
export const SERVICE_NAME = "funnel";
export const LAUNCHD_LABEL = "io.github.t128n.funnel";
export const MANIFEST_FILE = "install.json";

export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export function isInstallMode(value: string): value is InstallMode {
  return value === "system" || value === "user" || value === "portable";
}
