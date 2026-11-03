import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SetupArgs } from "../args";
import { parseSetupArgs, UsageError } from "../args";
import { openBrowser } from "../browser";
import {
  normalizePublicUrl,
  readEnvValue,
  readManifest,
  validateLogLevel,
  validatePort,
  writeEnvFile,
  writeManifest,
} from "../config";
import { copySelfToInstallDir } from "../files";
import { checkReadiness, onboardingUrl, waitForHealth } from "../health";
import {
  elevationHint,
  isElevated,
  PrivilegeError,
  relaunchElevated,
} from "../elevate";
import {
  currentPlatform,
  defaultPaths,
  isAbsolutePath,
  manifestPathFor,
  resolveInstallPaths,
  validateInstallPaths,
} from "../paths";
import { configFromManifest } from "./shared";
import { createServiceManager } from "../service";
import {
  askConfirm,
  askPassword,
  askSelect,
  askText,
  CancelledError,
  intro,
  note,
  outro,
  printJson,
  step,
  success,
  warn,
} from "../ui";
import {
  DEFAULT_LOG_LEVEL,
  DEFAULT_PORT,
  SERVICE_NAME,
  LAUNCHD_LABEL,
  isInteractive,
  type InstallConfig,
  type InstallManifest,
  type InstallMode,
  type LogMode,
} from "../types";
import { VERSION } from "../version";

const HELP = `funnel setup ${VERSION}

Usage: funnel setup [options]

Options:
  --mode <system|user|portable>  Skip the run-mode prompt
  --install-dir <path>           Program/binary directory
  --config-file <path>           Exact config file path
  --data-dir <path>              Database/uploads directory
  --log-dir <path>               Service/portable log directory
  --port <n>                     Listen port (default ${DEFAULT_PORT})
  --host <addr>                  Bind address
  --url <origin>                 Public origin, e.g. https://funnel.example.com
  --onboarding-token <token>     Optional first-run wizard token
  --log-level <level>            Default info
  --yes                          Non-interactive
  --dry-run                      Print the plan without changing files
  --force                        Replace existing config/service files after backup
  --no-elevate                   Print the sudo/UAC command instead of re-running
  --json                         Machine-readable result
  --verbose                      Extra diagnostics
  -h, --help                     Show this help

The setup command writes the configuration file from .env.example, generates
FUNNEL_SECRET, installs the service or starts a portable process, and opens
/onboarding.`;

interface ElevatedConfig extends Partial<SetupArgs> {
  logMode?: LogMode;
}

async function promptMode(platform: string): Promise<InstallMode> {
  const options =
    platform === "windows"
      ? [
          {
            value: "system" as const,
            label: "Windows service",
            hint: "starts at boot; needs administrator rights",
          },
          {
            value: "portable" as const,
            label: "Portable process",
            hint: "runs now; no service",
          },
        ]
      : [
          {
            value: "system" as const,
            label: "System service",
            hint: "starts at boot; needs admin/sudo",
          },
          {
            value: "user" as const,
            label: "User service",
            hint: "starts at login; no admin needed",
          },
          {
            value: "portable" as const,
            label: "Portable process",
            hint: "runs now; no service",
          },
        ];

  return askSelect({
    message: "How should Funnel run?",
    options,
  });
}

function validatePath(
  platform: ReturnType<typeof currentPlatform>,
): (value: string) => string | undefined {
  return (value) => {
    if (!value.trim()) return "Enter a path.";
    if (!isAbsolutePath(platform, value.trim())) return "Use an absolute path.";
    return undefined;
  };
}

async function promptPaths(
  platform: ReturnType<typeof currentPlatform>,
  defaults: InstallConfig,
): Promise<InstallConfig> {
  const customize = await askConfirm(
    "Customize install, config, data, and log paths?",
    false,
  );
  if (!customize) return defaults;

  const validate = validatePath(platform);
  const installDir = await askText({
    message: "Install directory",
    defaultValue: defaults.installDir,
    validate,
  });
  const configFile = await askText({
    message: "Configuration file",
    defaultValue: defaults.configFile,
    validate,
  });
  const dataDir = await askText({
    message: "Data directory",
    defaultValue: defaults.dataDir,
    validate,
  });
  const logDir = await askText({
    message: "Log directory",
    defaultValue: defaults.logDir,
    validate,
  });

  return {
    ...defaults,
    installDir,
    configFile,
    dataDir,
    logDir,
    manifestPath: manifestPathFor(configFile, platform),
    logMode: "file",
  };
}

async function buildConfig(
  args: SetupArgs,
  platform: ReturnType<typeof currentPlatform>,
  logModeOverride?: LogMode,
): Promise<InstallConfig> {
  const interactive = isInteractive() && !args.yes;
  const mode = args.mode ?? (interactive ? await promptMode(platform) : undefined);
  if (!mode) {
    throw new UsageError("--mode is required when setup is non-interactive.");
  }
  if (platform === "windows" && mode === "user") {
    throw new UsageError("--mode user is not available on Windows.");
  }

  const defaults = defaultPaths({ platform, mode });
  const providedPaths = Boolean(
    args.installDir || args.configFile || args.dataDir || args.logDir,
  );
  const resolved = resolveInstallPaths(
    defaults,
    {
      installDir: args.installDir,
      configFile: args.configFile,
      dataDir: args.dataDir,
      logDir: args.logDir,
    },
    platform,
  );
  const pathIssues = validateInstallPaths(resolved, platform);
  if (pathIssues.length) throw new UsageError(pathIssues.join(" "));

  let config: InstallConfig = {
    ...resolved,
    version: VERSION,
    platform,
    mode,
    port: args.port ?? DEFAULT_PORT,
    host: args.host ?? (mode === "portable" ? "127.0.0.1" : "0.0.0.0"),
    url: args.url ?? "",
    onboardingToken: args.onboardingToken,
    logLevel: args.logLevel ?? DEFAULT_LOG_LEVEL,
    logMode:
      logModeOverride ??
      (platform === "linux" && !providedPaths ? "journald" : "file"),
    force: args.force,
    dryRun: args.dryRun,
    noElevate: args.noElevate,
    serviceName: SERVICE_NAME,
    launchdLabel: LAUNCHD_LABEL,
  };

  if (interactive) {
    config = await promptPaths(platform, config);
  }

  if (interactive) {
    const portText = await askText({
      message: "Port",
      defaultValue: String(config.port),
      validate: (value) => {
        const port = Number(value);
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          return "Enter a port between 1 and 65535.";
        }
        return undefined;
      },
    });
    config.port = Number(portText);

    const urlText = await askText({
      message: "Public URL (leave empty for local)",
      defaultValue: config.url,
      placeholder: "https://funnel.example.com",
      validate: (value) => {
        if (!value.trim()) return undefined;
        try {
          normalizePublicUrl(value);
          return undefined;
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      },
    });
    config.url = normalizePublicUrl(urlText);

    const protect = await askConfirm(
      "Protect the onboarding wizard with a one-time token?",
      false,
    );
    if (protect) {
      config.onboardingToken = await askPassword(
        "Onboarding token",
        (value) => (value.trim() ? undefined : "Enter a token."),
      );
    }
  } else {
    config.url = normalizePublicUrl(config.url);
  }

  validatePort(config.port);
  validateLogLevel(config.logLevel);

  if (interactive && existsSync(config.configFile) && !args.force) {
    const replace = await askConfirm(
      `A config already exists at ${config.configFile}. Back it up and replace it?`,
      false,
    );
    config.force = replace;
  }

  return config;
}

function manifestFor(config: InstallConfig): InstallManifest {
  return {
    version: config.version,
    platform: config.platform,
    mode: config.mode,
    installDir: config.installDir,
    configFile: config.configFile,
    dataDir: config.dataDir,
    logDir: config.logDir,
    manifestPath: config.manifestPath,
    port: config.port,
    host: config.host,
    url: config.url,
    logLevel: config.logLevel,
    logMode: config.logMode,
    serviceName: config.serviceName,
    launchdLabel: config.launchdLabel,
    installedAt: new Date().toISOString(),
  };
}

function printPlan(config: InstallConfig): void {
  note(
    [
      `Mode:     ${config.mode}`,
      `Platform: ${config.platform}`,
      `Binary:   ${join(config.installDir, config.platform === "windows" ? "funnel.exe" : "funnel")}`,
      `Config:   ${config.configFile}`,
      `Data:     ${config.dataDir}`,
      `Logs:     ${config.logDir} (${config.logMode})`,
      `Port:     ${config.port}`,
      `URL:      ${config.url || "(local request origin)"}`,
      `Version:  ${config.version}`,
    ].join("\n"),
    "Installation plan",
  );
}

async function elevateIfNeeded(config: InstallConfig, args: SetupArgs): Promise<void> {
  if (config.mode !== "system" || isElevated()) return;

  if (args.noElevate) {
    throw new PrivilegeError(
      `System installation needs administrator rights. ${elevationHint()}`,
    );
  }

  const temp = join(
    tmpdir(),
    `funnel-setup-${process.pid}-${Date.now()}.json`,
  );
  const payload: ElevatedConfig = {
    mode: config.mode,
    installDir: config.installDir,
    configFile: config.configFile,
    dataDir: config.dataDir,
    logDir: config.logDir,
    port: config.port,
    host: config.host,
    url: config.url,
    onboardingToken: config.onboardingToken,
    logLevel: config.logLevel,
    logMode: config.logMode,
    force: config.force,
    yes: args.yes,
    noElevate: false,
    json: args.json,
    verbose: args.verbose,
  };
  writeFileSync(temp, JSON.stringify(payload), { encoding: "utf8", mode: 0o600 });
  step("Requesting administrator rights...");
  try {
    const code = await relaunchElevated(temp);
    process.exit(code);
  } finally {
    rmSync(temp, { force: true });
  }
}

export async function runSetup(argv: string[] = []): Promise<void> {
  const args = parseSetupArgs(argv);
  if (args.help) {
    console.log(HELP);
    return;
  }

  if (!args.dryRun && !Bun.isStandaloneExecutable && !process.env.FUNNEL_SETUP_ALLOW_DEV && !args.elevatedConfig) {
    throw new UsageError(
      "funnel setup must run from the packaged Funnel executable. Use a release binary or build with `mise run exe`.",
    );
  }

  const platform = currentPlatform();
  const interactive = isInteractive() && !args.yes && !args.json;
  if (interactive) intro(`Funnel setup ${VERSION}`);
  let config: InstallConfig;

  if (args.elevatedConfig) {
    const elevated = JSON.parse(
      readFileSync(args.elevatedConfig, "utf8"),
    ) as ElevatedConfig;
    config = await buildConfig(
      { ...args, ...elevated, yes: true, mode: elevated.mode ?? args.mode },
      platform,
      elevated.logMode,
    );
  } else {
    if (!isInteractive() && !args.yes) {
      throw new UsageError(
        "Setup needs a terminal. Re-run with --yes and explicit --mode for automation.",
      );
    }
    config = await buildConfig(args, platform);
  }

  if (config.dryRun) {
    if (args.json) printJson(config);
    else printPlan(config);
    return;
  }

  await elevateIfNeeded(config, args);

  const quiet = args.json;
  const existingManifest = readManifest(config.manifestPath);
  if (existingManifest && !quiet) {
    step(`Existing installation detected (${existingManifest.mode}).`);
  }

  const envResult = writeEnvFile({
    path: config.configFile,
    secret: undefined,
    publicUrl: config.url,
    onboardingToken: config.onboardingToken,
    logLevel: config.logLevel,
    port: config.port,
    host: config.host,
    dataDir: config.dataDir,
    force: config.force,
  });
  if (envResult.written) {
    if (!quiet) success(`Configuration written: ${config.configFile}`);
    if (envResult.backup && !quiet) {
      step(`Previous configuration backed up: ${envResult.backup}`);
    }
  } else {
    // The existing file wins. Reflect its values in the manifest and the
    // service health check instead of advertising the flags that were ignored.
    const existing = readFileSync(config.configFile, "utf8");
    const existingPort = Number(readEnvValue(existing, "PORT"));
    if (Number.isInteger(existingPort)) config.port = existingPort;
    config.host = readEnvValue(existing, "HOST") ?? config.host;
    config.url = readEnvValue(existing, "FUNNEL_URL") ?? config.url;
    config.dataDir = readEnvValue(existing, "FUNNEL_DATA_DIR") ?? config.dataDir;
    config.logLevel = readEnvValue(existing, "LOG_LEVEL") ?? config.logLevel;
    validatePort(config.port);
    validateLogLevel(config.logLevel);
    if (!quiet) {
      step(`Keeping existing configuration: ${config.configFile}`);
    }
  }

  writeManifest(config.manifestPath, manifestFor(config));

  if (existingManifest) {
    try {
      await createServiceManager(configFromManifest(existingManifest)).stop();
      if (!quiet) step("Stopped the previous installation before replacing it.");
    } catch {
      // The previous service may already be gone, or may use a different
      // manager; the copy below still protects against a busy image.
    }
  }

  copySelfToInstallDir(config);

  const manager = createServiceManager(config);
  await manager.install();
  await manager.start();

  const health = await waitForHealth(config.port);
  if (!health.ok) {
    throw new Error(
      `Funnel did not become healthy on port ${config.port}: ${health.detail ?? "unknown error"}`,
    );
  }
  const ready = await checkReadiness(config.port);
  if (!ready.ok && !quiet) {
    warn(`Readiness is not ready yet: ${ready.detail ?? "unknown"}.`);
  }

  const url = onboardingUrl(config.port, config.url);
  if (!quiet) {
    success(`Funnel is running: ${url}`);
  }
  if (isInteractive() && !args.json) {
    await openBrowser(url);
  }
  if (!quiet) {
    outro(
      `Done. Use "funnel status", "funnel logs", and "funnel uninstall" for lifecycle management.`,
    );
  }

  if (args.json) {
    printJson({ ...manifestFor(config), url, health: true, ready: ready.ok });
  }
}

export { HELP as SETUP_HELP };
