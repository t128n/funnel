import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { parseLifecycleArgs } from "../args";
import { readEnvValue, readManifest } from "../config";
import { checkReadiness, waitForHealth } from "../health";
import { currentPlatform, defaultPaths, findExistingManifest } from "../paths";
import { printDoctor, printJson } from "../ui";
import type { DoctorCheck, DoctorReport } from "../types";
import { VERSION } from "../version";
import { loadInstall } from "./shared";

const HELP = `funnel doctor

Usage: funnel doctor [--manifest <path>] [--json]

Checks the installation manifest, config, secret, data/log permissions, service,
health, readiness, and version.`;

function check(
  name: string,
  fn: () => void | string,
): DoctorCheck {
  try {
    const detail = fn();
    return {
      name,
      state: "ok",
      detail: typeof detail === "string" ? detail : undefined,
    };
  } catch (error) {
    return {
      name,
      state: "fail",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function warnCheck(name: string, detail: string): DoctorCheck {
  return { name, state: "warn", detail };
}

export async function runDoctor(argv: string[] = []): Promise<void> {
  const args = parseLifecycleArgs(argv);
  if (args.help) {
    console.log(HELP);
    return;
  }

  const checks: DoctorCheck[] = [];
  let loaded;
  try {
    loaded = loadInstall(args.manifest);
  } catch (error) {
    const fallback = defaultPaths({
      platform: currentPlatform(),
      mode: "system",
    }).manifestPath;
    const found = findExistingManifest(currentPlatform());
    checks.push({
      name: "Installation manifest",
      state: "fail",
      detail: found
        ? `Invalid manifest at ${found}`
        : `No manifest found (looked for ${fallback})`,
    });
    const report: DoctorReport = { ok: false, checks };
    if (args.json) printJson(report);
    else printDoctor(report);
    process.exitCode = 1;
    return;
  }

  const { manifest, manager } = loaded;

  checks.push(
    check("Installation manifest", () => {
      if (!existsSync(manifest.manifestPath)) {
        throw new Error(`Missing ${manifest.manifestPath}`);
      }
    }),
    check("Configuration file", () => {
      if (!existsSync(manifest.configFile)) {
        throw new Error(`Missing ${manifest.configFile}`);
      }
    }),
    check("FUNNEL_SECRET", () => {
      const content = readFileSync(manifest.configFile, "utf8");
      const secret = readEnvValue(content, "FUNNEL_SECRET");
      if (!secret) throw new Error("FUNNEL_SECRET is not set.");
      if (secret.length < 32) throw new Error("FUNNEL_SECRET is shorter than 32 characters.");
      return "present";
    }),
    check("Data directory", () => {
      if (!existsSync(manifest.dataDir)) throw new Error(`Missing ${manifest.dataDir}`);
      accessSync(manifest.dataDir, constants.W_OK);
      return "writable";
    }),
    check("Log directory", () => {
      if (!existsSync(manifest.logDir)) throw new Error(`Missing ${manifest.logDir}`);
      accessSync(manifest.logDir, constants.W_OK);
      return "writable";
    }),
    check("Binary", () => {
      if (!existsSync(manifest.installDir)) throw new Error(`Missing ${manifest.installDir}`);
      return "present";
    }),
  );

  const service = await manager.status();
  checks.push({
    name: "Service",
    state: service.running ? "ok" : service.installed ? "warn" : "fail",
    detail: service.detail ?? (service.running ? "running" : "not running"),
  });

  const health = await waitForHealth(manifest.port, 2_000);
  checks.push({
    name: "Health",
    state: health.ok ? "ok" : "fail",
    detail: health.detail,
  });

  const ready = await checkReadiness(manifest.port);
  checks.push({
    name: "Readiness",
    state: ready.ok ? "ok" : "warn",
    detail: ready.detail,
  });

  if (manifest.version !== VERSION) {
    checks.push(
      warnCheck(
        "Version",
        `manifest ${manifest.version}, running binary ${VERSION}`,
      ),
    );
  } else {
    checks.push({ name: "Version", state: "ok", detail: VERSION });
  }

  if (manager.doctorChecks) {
    try {
      checks.push(...(await manager.doctorChecks()));
    } catch (error) {
      checks.push({
        name: "Platform checks",
        state: "warn",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const report: DoctorReport = {
    ok: checks.every((entry) => entry.state !== "fail"),
    checks,
  };
  if (args.json) printJson(report);
  else printDoctor(report);
  if (!report.ok) process.exitCode = 1;
}

export { HELP as DOCTOR_HELP };
