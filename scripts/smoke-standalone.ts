#!/usr/bin/env bun
/**
 * End-to-end smoke test for the packaged standalone executable.
 *
 * Run it after `mise run exe` (the `smoke` mise task depends on `exe`). It
 * reuses `dist/funnel` (or `dist/funnel.exe` on Windows) and checks the parts
 * of the release contract that a unit test cannot: the real CLI, migration
 * bookkeeping, server boot, health probes, the self-healthcheck, and shutdown.
 *
 * Deliberately not part of `bun test`: the executable does not exist until the
 * standalone build has run, and this script boots a real server on a real port.
 *
 * Cross-platform notes:
 * - The Windows binary is `dist\funnel.exe`.
 * - Windows has no POSIX SIGTERM. `ChildProcess.kill()` terminates the process
 *   and Bun reports the platform's forced-exit code; the test only asserts that
 *   the process is gone within the bounded window. On POSIX, SIGTERM is sent
 *   and the normal adapter-node graceful shutdown (exit 0) is expected.
 */
import { Database } from "bun:sqlite";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  MIGRATIONS_TABLE,
  countMigrations,
} from "../src/lib/server/db/release";

const root = resolve(import.meta.dir, "..");
const isWindows = process.platform === "win32";
const binary = join(root, "dist", isWindows ? "funnel.exe" : "funnel");

const COMMAND_TIMEOUT_MS = 30_000;
const BOOT_TIMEOUT_MS = 30_000;
const SHUTDOWN_TIMEOUT_MS = 15_000;
const HEALTHCHECK_TIMEOUT_MS = 15_000;

type Child = ReturnType<typeof Bun.spawn>;

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface ServerHandle {
  proc: Child;
  logs: () => string;
  done: () => Promise<void>;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function describe(result: CommandResult): string {
  return [
    `exit=${result.exitCode}`,
    `stdout:\n${result.stdout.trim() || "(empty)"}`,
    `stderr:\n${result.stderr.trim() || "(empty)"}`,
  ].join("\n");
}

/**
 * Drain a child stream into a string without waiting for EOF, so a still-live
 * server can be reported on a timeout.
 */
function collect(stream: ReadableStream<Uint8Array> | undefined): {
  text: () => string;
  done: Promise<void>;
} {
  let output = "";
  const decoder = new TextDecoder();
  const done = (async () => {
    if (!stream) return;
    for await (const chunk of stream) {
      output += decoder.decode(chunk, { stream: true });
    }
    output += decoder.decode();
  })();
  return { text: () => output, done };
}

async function runCommand(
  args: string[],
  env: Record<string, string | undefined>,
  timeoutMs = COMMAND_TIMEOUT_MS,
): Promise<CommandResult> {
  const proc = Bun.spawn([binary, ...args], {
    cwd: root,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = collect(proc.stdout);
  const err = collect(proc.stderr);

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);

  try {
    await proc.exited;
  } finally {
    clearTimeout(timer);
    await Promise.all([out.done, err.done]);
  }

  if (timedOut) {
    throw new Error(
      `\`funnel ${args.join(" ")}\` did not exit within ${timeoutMs}ms`,
    );
  }

  return {
    exitCode: proc.exitCode ?? -1,
    stdout: out.text(),
    stderr: err.text(),
  };
}

function spawnServer(env: Record<string, string | undefined>): ServerHandle {
  const proc = Bun.spawn([binary], {
    cwd: root,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = collect(proc.stdout);
  const err = collect(proc.stderr);
  return {
    proc,
    logs: () =>
      [
        `--- server stdout ---`,
        out.text().trim() || "(empty)",
        `--- server stderr ---`,
        err.text().trim() || "(empty)",
      ].join("\n"),
    done: () => Promise.all([out.done, err.done]).then(() => undefined),
  };
}

/** Ask a process to stop and wait, bounded. Returns whether it actually exited. */
async function terminate(
  proc: Child,
  timeoutMs: number,
): Promise<{ clean: boolean; exitCode: number | null }> {
  if (proc.exitCode !== null) {
    return { clean: true, exitCode: proc.exitCode };
  }

  // SIGTERM is not a Windows concept; Bun's kill() is a forced termination there.
  proc.kill(isWindows ? undefined : "SIGTERM");

  const exited = await Promise.race([
    proc.exited.then(() => true),
    delay(timeoutMs).then(() => false),
  ]);
  if (!exited) {
    proc.kill("SIGKILL");
    await proc.exited;
    return { clean: false, exitCode: proc.exitCode };
  }
  return { clean: true, exitCode: proc.exitCode };
}

/** Reserve an unused port on loopback, then release it for the server. */
function freeLoopbackPort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port =
        typeof address === "object" && address ? address.port : undefined;
      server.close((error) => {
        if (error) reject(error);
        else if (port === undefined) reject(new Error("no port assigned"));
        else resolvePort(port);
      });
    });
  });
}

async function waitForReady(
  baseUrl: string,
  server: ServerHandle,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = "no request completed";

  while (Date.now() < deadline) {
    if (server.proc.exitCode !== null) {
      throw new Error(
        `server exited with code ${server.proc.exitCode} before becoming ready\n${server.logs()}`,
      );
    }

    try {
      const health = await fetch(`${baseUrl}/healthz`, {
        signal: AbortSignal.timeout(2_000),
      });
      const ready = await fetch(`${baseUrl}/readyz`, {
        signal: AbortSignal.timeout(2_000),
      });

      if (health.ok && ready.ok) {
        const body = (await ready.json()) as { status?: string };
        assert(
          body.status === "ready",
          `unexpected /readyz body: ${JSON.stringify(body)}`,
        );
        return;
      }

      last = `healthz=${health.status} readyz=${ready.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }

    await delay(200);
  }

  throw new Error(
    `timed out after ${timeoutMs}ms waiting for /healthz and /readyz (last: ${last})\n${server.logs()}`,
  );
}

function countAppliedMigrations(dbPath: string): number {
  const sqlite = new Database(dbPath, { readonly: true });
  try {
    const row = sqlite
      .query(`SELECT count(*) AS count FROM ${MIGRATIONS_TABLE}`)
      .get() as { count: number } | null;
    return row?.count ?? 0;
  } finally {
    sqlite.close();
  }
}

function parseMigrationReport(stdout: string): {
  applied: number;
  total: number;
} {
  const match = stdout.match(
    /\((\d+) migration\(s\) applied, (\d+) total\)/,
  );
  assert(
    match,
    `could not parse the migration report from stdout:\n${stdout.trim()}`,
  );
  return { applied: Number(match[1]), total: Number(match[2]) };
}

async function main(): Promise<void> {
  console.log(`[smoke] binary: ${binary}`);

  assert(
    existsSync(binary) && statSync(binary).isFile(),
    `standalone executable is missing at ${binary}. ` +
      `Run \`mise run exe\` (or \`bun run build\` then \`bun run build:standalone\`) first.`,
  );

  const pkg = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  ) as { version?: string };
  assert(pkg.version, "package.json does not declare a version");

  const migrationsFolder = join(root, "drizzle");
  const expectedMigrations = countMigrations(migrationsFolder);
  assert(
    expectedMigrations > 0,
    `no committed migrations found under ${migrationsFolder}`,
  );

  // --version ---------------------------------------------------------------
  const version = await runCommand(["--version"], process.env);
  assert(
    version.exitCode === 0,
    `\`--version\` exited ${version.exitCode}, expected 0\n${describe(version)}`,
  );
  assert(
    version.stdout.trim() === pkg.version,
    `\`--version\` printed ${JSON.stringify(version.stdout.trim())}, expected ${JSON.stringify(pkg.version)}`,
  );

  // Unknown flags are documented as ignored; they must not hang or fail. -----
  const unknown = await runCommand(
    ["--version", "--definitely-not-a-flag"],
    process.env,
  );
  assert(
    unknown.exitCode === 0,
    `an unknown flag changed the exit code (expected 0)\n${describe(unknown)}`,
  );
  assert(
    unknown.stdout.trim() === pkg.version,
    `an unknown flag changed the --version output\n${describe(unknown)}`,
  );

  // --help ------------------------------------------------------------------
  const help = await runCommand(["--help"], process.env);
  assert(
    help.exitCode === 0,
    `\`--help\` exited ${help.exitCode}, expected 0\n${describe(help)}`,
  );
  for (const flag of ["--migrate", "--healthcheck", "--version", "--help"]) {
    assert(
      help.stdout.includes(flag),
      `\`--help\` does not mention ${flag}\n${describe(help)}`,
    );
  }
  assert(
    help.stdout.includes("Usage: funnel"),
    `\`--help\` does not print a usage line\n${describe(help)}`,
  );

  console.log(
    "[smoke] CLI: --version, --help, and unknown-flag handling OK",
  );

  const tempRoot = mkdtempSync(join(tmpdir(), "funnel-smoke-"));
  let server: ServerHandle | undefined;
  let stopped = false;

  try {
    // --migrate against a fresh data directory -----------------------------
    const migrateDir = join(tempRoot, "migrate");
    const migrateDb = join(migrateDir, "funnel.db");
    const migrateEnv = {
      ...process.env,
      FUNNEL_DATA_DIR: migrateDir,
      FUNNEL_DB: migrateDb,
      FUNNEL_UPLOAD_DIR: join(migrateDir, "uploads"),
      LOG_LEVEL: "silent",
    };

    const first = await runCommand(["--migrate"], migrateEnv);
    assert(
      first.exitCode === 0,
      `\`--migrate\` exited ${first.exitCode}, expected 0\n${describe(first)}`,
    );
    const firstReport = parseMigrationReport(first.stdout);
    assert(
      firstReport.applied === expectedMigrations,
      `\`--migrate\` applied ${firstReport.applied} migrations, expected ${expectedMigrations}\n${describe(first)}`,
    );
    assert(
      firstReport.total === expectedMigrations,
      `\`--migrate\` reported ${firstReport.total} total, expected ${expectedMigrations}\n${describe(first)}`,
    );
    assert(
      existsSync(migrateDb),
      `\`--migrate\` did not create the database at ${migrateDb}`,
    );
    const appliedAfterFirst = countAppliedMigrations(migrateDb);
    assert(
      appliedAfterFirst === expectedMigrations,
      `${MIGRATIONS_TABLE} has ${appliedAfterFirst} rows, expected ${expectedMigrations}`,
    );

    const second = await runCommand(["--migrate"], migrateEnv);
    assert(
      second.exitCode === 0,
      `second \`--migrate\` exited ${second.exitCode}, expected 0\n${describe(second)}`,
    );
    const secondReport = parseMigrationReport(second.stdout);
    assert(
      secondReport.applied === 0,
      `second \`--migrate\` applied ${secondReport.applied} migrations, expected 0 (not idempotent)\n${describe(second)}`,
    );
    assert(
      secondReport.total === expectedMigrations,
      `second \`--migrate\` reported ${secondReport.total} total, expected ${expectedMigrations}\n${describe(second)}`,
    );
    const appliedAfterSecond = countAppliedMigrations(migrateDb);
    assert(
      appliedAfterSecond === expectedMigrations,
      `${MIGRATIONS_TABLE} has ${appliedAfterSecond} rows after the second run, expected ${expectedMigrations}`,
    );

    console.log(
      `[smoke] migrations: ${expectedMigrations} applied, rerun idempotent OK`,
    );

    // Boot on a fresh data directory, with a free loopback port. -----------
    const bootDir = join(tempRoot, "boot");
    const port = await freeLoopbackPort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const bootEnv = {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      FUNNEL_SECRET: "0123456789abcdef0123456789abcdef",
      FUNNEL_DATA_DIR: bootDir,
      FUNNEL_DB: join(bootDir, "funnel.db"),
      FUNNEL_UPLOAD_DIR: join(bootDir, "uploads"),
      FUNNEL_URL: baseUrl,
      LOG_LEVEL: "silent",
    };

    console.log(`[smoke] starting ${binary} on ${baseUrl}`);
    server = spawnServer(bootEnv);
    await waitForReady(baseUrl, server, BOOT_TIMEOUT_MS);
    console.log("[smoke] /healthz and /readyz returned 200");

    // --healthcheck against the live instance ------------------------------
    const live = await runCommand(
      ["--healthcheck"],
      { ...process.env, PORT: String(port) },
      HEALTHCHECK_TIMEOUT_MS,
    );
    assert(
      live.exitCode === 0,
      `\`--healthcheck\` against a live server exited ${live.exitCode}, expected 0\n${describe(live)}`,
    );

    // Graceful shutdown -----------------------------------------------------
    const shutdown = await terminate(server.proc, SHUTDOWN_TIMEOUT_MS);
    stopped = true;
    await server.done();
    const serverLogs = server.logs();

    assert(
      shutdown.clean,
      `server did not exit within ${SHUTDOWN_TIMEOUT_MS}ms of the termination signal\n${serverLogs}`,
    );
    if (!isWindows) {
      // adapter-node handles SIGTERM and closes the listener cleanly (0). A
      // runtime that is torn down by the signal reports 143; both are fine, a
      // crash (1, 134, …) is not.
      assert(
        shutdown.exitCode === 0 || shutdown.exitCode === 143,
        `server crashed on SIGTERM (exit ${shutdown.exitCode}), expected 0 or 143\n${serverLogs}`,
      );
    }
    // Windows has no POSIX signal: Bun's forced kill can report a null exit
    // code even though the process is gone, so `clean` is the assertion there.
    console.log(
      `[smoke] shutdown cleanly (exitCode=${shutdown.exitCode ?? "null"}, signalCode=${server.proc.signalCode ?? "null"})`,
    );

    // --healthcheck against a stopped instance -----------------------------
    const dead = await runCommand(
      ["--healthcheck"],
      { ...process.env, PORT: String(port) },
      HEALTHCHECK_TIMEOUT_MS,
    );
    assert(
      dead.exitCode === 1,
      `\`--healthcheck\` against a stopped server exited ${dead.exitCode}, expected 1\n${describe(dead)}`,
    );

    console.log("[smoke] healthcheck: live=0 stopped=1 OK");
  } finally {
    if (server && !stopped) {
      const cleanup = await terminate(server.proc, 5_000);
      if (!cleanup.clean) {
        console.error(
          `[smoke] warning: server did not stop during cleanup\n${server.logs()}`,
        );
      }
    }
    rmSync(tempRoot, { recursive: true, force: true });
  }

  console.log("[smoke] OK");
}

try {
  await main();
  // Bun's fetch keep-alive sockets can hold the event loop open for seconds
  // after the last request. All cleanup already ran in main's `finally` block,
  // so exit explicitly instead of waiting for the pool to drain.
  process.exit(0);
} catch (error) {
  console.error(
    `[smoke] FAIL: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
