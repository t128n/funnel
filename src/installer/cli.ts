import { UsageError } from "./args";
import { PrivilegeError } from "./elevate";
import { runDoctor } from "./commands/doctor";
import { runLogs } from "./commands/logs";
import { runSetup } from "./commands/setup";
import { runStatus } from "./commands/status";
import { runUninstall } from "./commands/uninstall";
import { runUpgrade } from "./commands/upgrade";
import { CancelledError, error } from "./ui";

const COMMANDS = new Set([
  "setup",
  "status",
  "logs",
  "uninstall",
  "doctor",
  "upgrade",
]);

const HELP = `funnel installer

Usage: funnel <command> [options]

Commands:
  setup       Install Funnel, create the config, and start it
  status      Show service and health status
  logs        Show service or portable logs
  uninstall   Stop and remove the service; keep data unless --purge
  doctor      Diagnose config, permissions, service, and health
  upgrade     Install a downloaded binary and roll back on failure

Run "funnel <command> --help" for command-specific options.`;

export function isInstallerCommand(command: string | undefined): boolean {
  return command !== undefined && COMMANDS.has(command);
}

export async function runInstallerCli(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;

  try {
    switch (command) {
      case "setup":
        await runSetup(rest);
        break;
      case "status":
        await runStatus(rest);
        break;
      case "logs":
        await runLogs(rest);
        break;
      case "uninstall":
        await runUninstall(rest);
        break;
      case "doctor":
        await runDoctor(rest);
        break;
      case "upgrade":
        await runUpgrade(rest);
        break;
      case "help":
      case "--help":
      case "-h":
        console.log(HELP);
        break;
      default:
        throw new UsageError(`Unknown command: ${command ?? "(none)"}`);
    }
  } catch (errorValue) {
    if (errorValue instanceof CancelledError) {
      process.exitCode = 130;
      return;
    }
    if (errorValue instanceof PrivilegeError) {
      error(errorValue.message);
      process.exitCode = errorValue.exitCode;
      return;
    }
    if (errorValue instanceof UsageError) {
      error(errorValue.message);
      process.exitCode = errorValue.exitCode;
      return;
    }
    error(errorValue instanceof Error ? errorValue.message : String(errorValue));
    process.exitCode = 1;
  }
}

export { HELP as INSTALLER_HELP };
