import { parse } from "@bomb.sh/args";
import { isInstallMode, type InstallMode } from "./types";

export class UsageError extends Error {
  readonly exitCode = 2;
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

type Parsed = Record<string, unknown> & { _: string[] };

function parseArgs(
  argv: string[],
  spec: {
    boolean?: string[];
    string?: string[];
    alias?: Record<string, string>;
  },
): Parsed {
  return parse(argv, spec as never) as Parsed;
}

function stringValue(args: Parsed, key: string): string | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" && typeof value !== "number") {
    throw new UsageError(`--${key} requires a value.`);
  }
  return String(value);
}

function booleanValue(args: Parsed, key: string): boolean {
  return args[key] === true;
}

function numberValue(args: Parsed, key: string): number | undefined {
  const raw = stringValue(args, key);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new UsageError(`--${key} must be a number.`);
  return value;
}

function requiredString(args: Parsed, key: string): string {
  const value = stringValue(args, key);
  if (!value) throw new UsageError(`--${key} is required.`);
  return value;
}

export interface SetupArgs {
  help: boolean;
  mode?: InstallMode;
  installDir?: string;
  configFile?: string;
  dataDir?: string;
  logDir?: string;
  port?: number;
  host?: string;
  url?: string;
  onboardingToken?: string;
  logLevel?: string;
  yes: boolean;
  dryRun: boolean;
  force: boolean;
  noElevate: boolean;
  json: boolean;
  verbose: boolean;
  elevatedConfig?: string;
}

export interface LifecycleArgs {
  help: boolean;
  manifest?: string;
  json: boolean;
  verbose: boolean;
}

export interface LogsArgs extends LifecycleArgs {
  follow: boolean;
  lines: number;
}

export interface UninstallArgs extends LifecycleArgs {
  purge: boolean;
  yes: boolean;
}

export interface UpgradeArgs extends LifecycleArgs {
  check: boolean;
  binary?: string;
  version?: string;
  yes: boolean;
}

const commonBoolean = ["help", "json", "verbose"];
const commonString = ["manifest"];

export function parseSetupArgs(argv: string[]): SetupArgs {
  const args = parseArgs(argv, {
    boolean: [
      ...commonBoolean,
      "yes",
      "dry-run",
      "force",
      "no-elevate",
    ],
    string: [
      "mode",
      "install-dir",
      "config-file",
      "data-dir",
      "log-dir",
      "port",
      "host",
      "url",
      "onboarding-token",
      "log-level",
      "elevated-config",
    ],
    alias: { h: "help", y: "yes" },
  });

  const mode = stringValue(args, "mode");
  if (mode && !isInstallMode(mode)) {
    throw new UsageError("--mode must be system, user, or portable.");
  }

  return {
    help: booleanValue(args, "help"),
    mode: mode as InstallMode | undefined,
    installDir: stringValue(args, "install-dir"),
    configFile: stringValue(args, "config-file"),
    dataDir: stringValue(args, "data-dir"),
    logDir: stringValue(args, "log-dir"),
    port: numberValue(args, "port"),
    host: stringValue(args, "host"),
    url: stringValue(args, "url"),
    onboardingToken: stringValue(args, "onboarding-token"),
    logLevel: stringValue(args, "log-level"),
    yes: booleanValue(args, "yes"),
    dryRun: booleanValue(args, "dry-run"),
    force: booleanValue(args, "force"),
    // @bomb.sh/args normalizes --no-elevate to { elevate: false }.
    noElevate: args.elevate === false || booleanValue(args, "no-elevate"),
    json: booleanValue(args, "json"),
    verbose: booleanValue(args, "verbose"),
    elevatedConfig: stringValue(args, "elevated-config"),
  };
}

export function parseLifecycleArgs(argv: string[]): LifecycleArgs {
  const args = parseArgs(argv, {
    boolean: commonBoolean,
    string: commonString,
    alias: { h: "help" },
  });
  return {
    help: booleanValue(args, "help"),
    manifest: stringValue(args, "manifest"),
    json: booleanValue(args, "json"),
    verbose: booleanValue(args, "verbose"),
  };
}

export function parseLogsArgs(argv: string[]): LogsArgs {
  const args = parseArgs(argv, {
    boolean: [...commonBoolean, "follow"],
    string: [...commonString, "lines"],
    alias: { h: "help", f: "follow" },
  });
  return {
    ...parseLifecycleArgs(argv),
    follow: booleanValue(args, "follow"),
    lines: numberValue(args, "lines") ?? 100,
  };
}

export function parseUninstallArgs(argv: string[]): UninstallArgs {
  const args = parseArgs(argv, {
    boolean: [...commonBoolean, "purge", "yes"],
    string: commonString,
    alias: { h: "help", y: "yes" },
  });
  return {
    ...parseLifecycleArgs(argv),
    purge: booleanValue(args, "purge"),
    yes: booleanValue(args, "yes"),
  };
}

export function parseUpgradeArgs(argv: string[]): UpgradeArgs {
  const args = parseArgs(argv, {
    boolean: [...commonBoolean, "check", "yes"],
    string: [...commonString, "binary", "version"],
    alias: { h: "help", y: "yes" },
  });
  return {
    ...parseLifecycleArgs(argv),
    check: booleanValue(args, "check"),
    binary: stringValue(args, "binary"),
    version: stringValue(args, "version"),
    yes: booleanValue(args, "yes"),
  };
}

export function requireValue(value: string | undefined, message: string): string {
  if (!value) throw new UsageError(message);
  return value;
}
