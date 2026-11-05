/**
 * Standalone (single-executable) bootstrap.
 *
 * This module is side-effect-free on import: the server entry (`build/index.js`)
 * is loaded by the generated entrypoint that `scripts/build-standalone.ts`
 * compiles, *after* {@link runStandalone} has prepared the environment. Splitting
 * it this way keeps the import of the build output out of the TypeScript
 * program (which would otherwise pull the entire generated `build/` tree in and
 * report thousands of errors).
 *
 * The flag handling and data-directory defaults live here so they are identical
 * for a plain `bun src/standalone-entry.ts` run and the compiled executable.
 */
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { runMigrations } from "#lib/server/db/release";

const INSTALLER_COMMANDS = new Set([
  "setup",
  "status",
  "logs",
  "uninstall",
  "doctor",
  "upgrade",
]);

// Replaced by the standalone build; safe when unbundled (`typeof` on an
// undeclared identifier does not throw).
declare const __APP_VERSION__: string;
const VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

export const USAGE = `funnel ${VERSION}

Usage: funnel [options]
       funnel <setup|status|logs|uninstall|doctor|upgrade> [options]

Options:
  --migrate      Apply pending database migrations, then exit.
  --healthcheck  Probe the running instance's /healthz and exit 0/1.
  --version      Print the version and exit.
  --help         Show this help and exit.

Commands:
  setup          Install Funnel, create the config, and start it
  status         Show service and health status
  logs           Show service or portable logs
  uninstall      Stop and remove the service; keep data unless --purge
  doctor         Diagnose config, permissions, service, and health
  upgrade        Install a downloaded binary and roll back on failure

Environment:
  FUNNEL_ENV_FILE        Optional env file loaded before startup
  FUNNEL_DATA_DIR        Directory for the database and uploads (default: ./data)
  FUNNEL_DB              SQLite database path (default: <data dir>/funnel.db)
  FUNNEL_UPLOAD_DIR      Attachment directory (default: <data dir>/uploads)
  FUNNEL_URL             Public origin, e.g. https://funnel.example.com
  FUNNEL_SECRET          Encryption secret (required)
  FUNNEL_ONBOARDING_TOKEN  Optional one-time token for the first-run wizard
  PORT, HOST, LOG_LEVEL, BODY_SIZE_LIMIT, FUNNEL_UPLOAD_MAX_BYTES

The GitHub App is created by the in-app onboarding wizard; no GitHub
credentials are configured through the environment.

A .env file in the working directory is loaded automatically. Installed
services set FUNNEL_ENV_FILE to an absolute config path.`;

/**
 * Point the app at a writable data directory. Everything is overridable; the
 * defaults only keep a first run from failing on a missing directory.
 */
export function applyDataDefaults(): string {
  const dir = resolve(
    process.env.FUNNEL_DATA_DIR?.trim() || join(process.cwd(), "data"),
  );
  mkdirSync(dir, { recursive: true });

  process.env.FUNNEL_DB ??= join(dir, "funnel.db");
  process.env.FUNNEL_UPLOAD_DIR ??= join(dir, "uploads");

  return dir;
}

/**
 * Probe a running instance's liveness endpoint. Lets the executable act as its
 * own container / service health check, with no `curl` or extra runtime in the
 * image.
 */
async function healthcheck(): Promise<never> {
  const port = process.env.PORT?.trim() || "3000";
  const url = `http://127.0.0.1:${port}/healthz`;
  try {
    const response = await fetch(url);
    process.exit(response.ok ? 0 : 1);
  } catch (error) {
    console.error(
      `[funnel] healthcheck failed (${url}): ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

/**
 * Handle CLI flags, create the data directory, and apply migrations. Returns
 * once the process is ready to serve (or exits for `--help` / `--version` /
 * `--migrate` / `--healthcheck`). Exits non-zero if migrations fail.
 */
/**
 * Load an explicit env file for installed services. A compiled Bun executable
 * does not understand Bun's `--env-file` runtime flag, so this must be done in
 * application code. Existing process variables keep precedence.
 */
function loadInstalledEnvFile(): void {
  const path = process.env.FUNNEL_ENV_FILE?.trim();
  if (!path || !existsSync(path)) return;
  loadDotenv({ path, override: false, quiet: true });
}

/**
 * A compiled Bun binary exposes `["bun", "/$bunfs/root/<binary>", ...args]`,
 * while a normal `bun <script>` run exposes `["bun", "<script>", ...args]`.
 * Strip the runtime and script entries in both cases.
 */
export function cliArgs(argv = process.argv): string[] {
  return argv[0] === "bun" ? argv.slice(2) : argv.slice(1);
}

export async function runStandalone(): Promise<void> {
  loadInstalledEnvFile();

  // adapter-node closes the listener on SIGTERM/SIGINT and then emits this
  // event, but the sync worker and reconciliation timers keep Bun's event loop
  // alive, so the process would never actually exit. Exit here so a service
  // manager or container runtime sees a prompt, clean stop after the listener
  // has drained.
  process.once("sveltekit:shutdown", () => process.exit(0));

  const args = cliArgs();

  const command = args[0];
  if (command && INSTALLER_COMMANDS.has(command)) {
    const { runInstallerCli } = await import("./installer/cli");
    await runInstallerCli(args);
    process.exit(process.exitCode ?? 0);
  }

  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    process.exit(0);
  }

  if (args.includes("--version") || args.includes("-v")) {
    console.log(VERSION);
    process.exit(0);
  }

  if (args.includes("--healthcheck")) {
    await healthcheck();
  }

  applyDataDefaults();

  try {
    const report = runMigrations();
    console.log(
      `[funnel] database ready at ${report.dbPath} (${report.applied} migration(s) applied, ${report.after} total)`,
    );
  } catch (error) {
    console.error(
      `[funnel] migration failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }

  if (args.includes("--migrate")) process.exit(0);
}
