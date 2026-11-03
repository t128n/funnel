import { existsSync, readFileSync } from "node:fs";
import { quotePowerShell } from "./platform/util";

export async function tailFile(
  path: string,
  options: { follow: boolean; lines: number },
): Promise<void> {
  if (!existsSync(path)) {
    throw new Error(`Log file not found: ${path}`);
  }

  if (!options.follow) {
    const lines = readFileSync(path, "utf8").split(/\r?\n/);
    const slice = lines.slice(-Math.max(1, options.lines));
    console.log(slice.join("\n").replace(/\n+$/, ""));
    return;
  }

  const command =
    process.platform === "win32"
      ? [
          "powershell",
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `Get-Content -LiteralPath ${quotePowerShell(path)} -Tail ${options.lines} -Wait`,
        ]
      : ["tail", "-n", String(options.lines), "-F", path];

  const child = Bun.spawn(command, {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  await child.exited;
}
