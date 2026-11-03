export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function run(
  command: string[],
  options: { cwd?: string; env?: Record<string, string | undefined> } = {},
): Promise<RunResult> {
  const child = Bun.spawn(command, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdin: "inherit",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, stdout, stderr };
}

export function runSync(
  command: string[],
  options: { cwd?: string; env?: Record<string, string | undefined> } = {},
): RunResult {
  const result = Bun.spawnSync(command, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdin: "inherit",
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: result.exitCode ?? 1,
    stdout: result.stdout?.toString() ?? "",
    stderr: result.stderr?.toString() ?? "",
  };
}

export async function runOrThrow(
  command: string[],
  options: { cwd?: string; env?: Record<string, string | undefined> } = {},
): Promise<RunResult> {
  const result = await run(command, options);
  if (result.exitCode !== 0) {
    throw new Error(
      `${command.join(" ")} failed (exit ${result.exitCode})${result.stderr ? `: ${result.stderr.trim()}` : ""}`,
    );
  }
  return result;
}

export function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function quoteShell(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function isRoot(): boolean {
  return typeof process.getuid === "function" && process.getuid() === 0;
}

export async function commandExists(command: string): Promise<boolean> {
  const probe = process.platform === "win32" ? "where" : "which";
  const result = await run([probe, command]);
  return result.exitCode === 0;
}

export function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}
