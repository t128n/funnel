import { parseLogsArgs } from "../args";
import { loadInstall } from "./shared";

const HELP = `funnel logs

Usage: funnel logs [--follow] [--lines <n>] [--manifest <path>]

Prints the installed service or portable process log.`;

export async function runLogs(argv: string[] = []): Promise<void> {
  const args = parseLogsArgs(argv);
  if (args.help) {
    console.log(HELP);
    return;
  }
  const { manager } = loadInstall(args.manifest);
  await manager.logs({ follow: args.follow, lines: args.lines });
}

export { HELP as LOGS_HELP };
