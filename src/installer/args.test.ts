import { describe, expect, test } from "bun:test";
import {
  parseLifecycleArgs,
  parseLogsArgs,
  parseSetupArgs,
  parseUninstallArgs,
  parseUpgradeArgs,
  UsageError,
} from "./args";

describe("parseSetupArgs", () => {
  test("parses paths, mode, and automation flags", () => {
    const args = parseSetupArgs([
      "--mode",
      "system",
      "--config-file",
      "D:\\Data\\Funnel\\funnel.env",
      "--log-dir",
      "D:\\Data\\Funnel\\Logs",
      "--port",
      "3100",
      "--yes",
      "--force",
      "--no-elevate",
      "--json",
    ]);
    expect(args.mode).toBe("system");
    expect(args.configFile).toBe("D:\\Data\\Funnel\\funnel.env");
    expect(args.logDir).toBe("D:\\Data\\Funnel\\Logs");
    expect(args.port).toBe(3100);
    expect(args.yes).toBe(true);
    expect(args.force).toBe(true);
    expect(args.noElevate).toBe(true);
    expect(args.json).toBe(true);
  });

  test("rejects an unknown mode", () => {
    expect(() => parseSetupArgs(["--mode", "daemon"])).toThrow(UsageError);
  });

  test("rejects a non-numeric port", () => {
    expect(() => parseSetupArgs(["--port", "abc"])).toThrow(UsageError);
  });
});

describe("lifecycle args", () => {
  test("reads the manifest override", () => {
    expect(parseLifecycleArgs(["--manifest", "/tmp/install.json"]).manifest).toBe(
      "/tmp/install.json",
    );
  });

  test("logs defaults to 100 lines", () => {
    const args = parseLogsArgs([]);
    expect(args.lines).toBe(100);
    expect(args.follow).toBe(false);
    expect(parseLogsArgs(["--follow", "--lines", "5"]).follow).toBe(true);
  });

  test("uninstall and upgrade flags", () => {
    expect(parseUninstallArgs(["--purge", "--yes"]).purge).toBe(true);
    const upgrade = parseUpgradeArgs(["--binary", "/tmp/funnel"]);
    expect(upgrade.binary).toBe("/tmp/funnel");
    expect(upgrade.check).toBe(false);
  });
});
