import { parseLifecycleArgs, UsageError } from "../args";
import { checkReadiness, waitForHealth } from "../health";
import { printJson, printDoctor } from "../ui";
import type { DoctorReport } from "../types";
import { loadInstall } from "./shared";

const HELP = `funnel status

Usage: funnel status [--manifest <path>] [--json]

Shows the installation mode, paths, service state, health, and version.`;

export async function runStatus(argv: string[] = []): Promise<void> {
  const args = parseLifecycleArgs(argv);
  if (args.help) {
    console.log(HELP);
    return;
  }

  let loaded;
  try {
    loaded = loadInstall(args.manifest);
  } catch (error) {
    if (args.json) {
      printJson({ ok: false, error: error instanceof Error ? error.message : String(error) });
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const { manifest, manager } = loaded;
  const service = await manager.status();
  const health = await waitForHealth(manifest.port, 2_000);
  const ready = await checkReadiness(manifest.port);

  const report = {
    ok: service.running && health.ok,
    version: manifest.version,
    platform: manifest.platform,
    mode: manifest.mode,
    installDir: manifest.installDir,
    configFile: manifest.configFile,
    dataDir: manifest.dataDir,
    logDir: manifest.logDir,
    port: manifest.port,
    url: manifest.url || `http://127.0.0.1:${manifest.port}`,
    service,
    health,
    ready,
  };

  if (args.json) {
    printJson(report);
    if (!report.ok) process.exitCode = 1;
    return;
  }

  const checks: DoctorReport["checks"] = [
    {
      name: "Service",
      state: service.running ? "ok" : service.installed ? "warn" : "fail",
      detail: service.detail ?? (service.running ? "running" : "not running"),
    },
    {
      name: "Health",
      state: health.ok ? "ok" : "fail",
      detail: health.detail,
    },
    {
      name: "Readiness",
      state: ready.ok ? "ok" : "warn",
      detail: ready.detail,
    },
  ];
  printDoctor({ ok: report.ok, checks });
  console.log(
    [
      `Version:  ${manifest.version}`,
      `Mode:     ${manifest.mode}`,
      `Platform: ${manifest.platform}`,
      `Binary:   ${manifest.installDir}`,
      `Config:   ${manifest.configFile}`,
      `Data:     ${manifest.dataDir}`,
      `Logs:     ${manifest.logDir}`,
      `URL:      ${report.url}`,
    ].join("\n"),
  );
  if (!report.ok) process.exitCode = 1;
}

export { HELP as STATUS_HELP };
