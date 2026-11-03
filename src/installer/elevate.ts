import { quotePowerShell, runSync } from "./platform/util";

export class PrivilegeError extends Error {
  readonly exitCode = 3;
  constructor(message: string) {
    super(message);
    this.name = "PrivilegeError";
  }
}

export function isElevated(): boolean {
  if (process.platform === "win32") {
    const result = runSync(["net", "session"]);
    return result.exitCode === 0;
  }
  return typeof process.getuid === "function" && process.getuid() === 0;
}

export function elevatedCommand(configPath: string): string[] {
  return [process.execPath, "setup", "--elevated-config", configPath];
}

export async function relaunchElevated(configPath: string): Promise<number> {
  if (process.platform === "win32") {
    const command = [
      "$ErrorActionPreference = 'Stop'",
      `$p = Start-Process -FilePath ${quotePowerShell(process.execPath)} -Verb RunAs -Wait -PassThru -ArgumentList @('setup','--elevated-config',${quotePowerShell(configPath)})`,
      "exit $p.ExitCode",
    ].join("; ");
    const result = await Bun.spawn(
      ["powershell", "-NoProfile", "-NonInteractive", "-Command", command],
      {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      },
    ).exited;
    return result;
  }

  const result = await Bun.spawn(
    ["sudo", process.execPath, "setup", "--elevated-config", configPath],
    {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    },
  ).exited;
  return result;
}

export function elevationHint(): string {
  if (process.platform === "win32") {
    return "Run setup from an elevated PowerShell window (Run as administrator).";
  }
  return `Run: sudo ${process.execPath} setup`;
}
