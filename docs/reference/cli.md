# Command-line interface

This page documents the `funnel` executable's flags, exit behaviour, data-directory defaults, migration-on-boot behaviour, and healthcheck target.

## Executable scope

`funnel` (or `funnel.exe`) is the self-contained executable produced by `mise run exe` or `bun run build:standalone`. It embeds the adapter-node server, client assets, committed migrations, the Bun runtime, and the platform-specific Markdown addon. Its entry point calls `runStandalone()` before importing the generated server.

`runStandalone()` handles the flags below, applies data-directory defaults, and runs migrations. The version printed by `--version` is substituted from `package.json` during a standalone build; an unbundled run reports `dev`.

`bun ./build/index.js` (`bun run start`) runs only the adapter-node server. It does not parse these flags, does not apply the packaged executable's data-directory defaults, and does not run migrations.

## Usage text

```text
funnel <version>

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

A .env file in the working directory is loaded automatically.
```

## Flags

Flags are checked in the order shown. Unknown arguments are ignored.

| Flag | Behaviour | Exit |
| :--- | :--- | :--- |
| `--help`, `-h` | Print the usage text and stop. | `0` |
| `--version`, `-v` | Print the version and stop. | `0` |
| `--healthcheck` | Request `http://127.0.0.1:<PORT>/healthz` and stop. | `0` when the response is successful, otherwise `1` |
| `--migrate` | Apply pending migrations, then stop. | `0` on success, `1` on failure |
| None | Apply pending migrations, then start the server. | Process lifetime; `1` if migrations fail before serving |

## Installer and lifecycle commands

The self-contained executable also owns installation. Run `funnel setup` from
the extracted release archive; it copies itself to the chosen install directory.

| Command | Purpose |
| :--- | :--- |
| `funnel setup` | Interactive installer: mode, paths, port, URL, token, service/portable, health check. |
| `funnel setup --yes --mode <system\|user\|portable>` | Non-interactive install; requires explicit mode. |
| `funnel setup --dry-run` | Print the plan without writing files. |
| `funnel status [--json]` | Manifest paths, service state, health, readiness, version. |
| `funnel logs [--follow] [--lines <n>]` | journald, launchd log, WinSW log, or portable log. |
| `funnel doctor [--json]` | Config, secret, directories, service, health, platform checks. |
| `funnel uninstall [--purge] [--yes]` | Stop/remove the service; keep data unless purged. |
| `funnel upgrade --binary <path>` | Replace the binary, restart, health-check, roll back on failure. |
| `funnel upgrade --check` | Show the current version and the supported upgrade path. |

Setup options: `--mode`, `--install-dir`, `--config-file`, `--data-dir`,
`--log-dir`, `--port`, `--host`, `--url`, `--onboarding-token`, `--log-level`,
`--yes`, `--dry-run`, `--force`, `--no-elevate`, `--json`, `--verbose`.
`--config-file` and `--log-dir` accept arbitrary absolute paths, including a
different Windows drive.

Lifecycle commands accept `--manifest <path>` when the installation manifest is
not in the platform default config directory.

## Healthcheck target

The healthcheck always targets `http://127.0.0.1:${PORT}/healthz`, where `PORT` defaults to `3000`. It does not use `HOST`, `FUNNEL_URL`, the request origin, or `/readyz`. Any successful HTTP response (any 2xx status) exits `0`; a non-success response or a fetch error exits `1`. A fetch error also prints `[funnel] healthcheck failed (<url>): <message>` to standard error.

Because the target is `/healthz`, the healthcheck tests process liveness only. It does not verify database reachability, migration state, or readiness.

## Data-directory defaults

The bootstrap resolves and creates a data directory before migrations or server startup:

| Variable | Value when unset |
| :--- | :--- |
| `FUNNEL_DATA_DIR` | `<working directory>/data`, resolved to an absolute path |
| `FUNNEL_DB` | `<data directory>/funnel.db` |
| `FUNNEL_UPLOAD_DIR` | `<data directory>/uploads` |

Explicit values for `FUNNEL_DB` and `FUNNEL_UPLOAD_DIR` are preserved. The data directory itself is created recursively; the database parent directory is also created by the migration runner. These defaults are not applied for `--help`, `--version`, or `--healthcheck`, because those paths exit before the bootstrap. They are applied for `--migrate` and for a normal server start.

## Migration on boot

Every normal invocation and every `--migrate` invocation calls `runMigrations()` from `src/lib/server/db/release.ts` after applying the data-directory defaults. The runner:

- Resolves the database path from `FUNNEL_DB`.
- Resolves the migrations folder from `FUNNEL_MIGRATIONS_DIR`, or probes the layouts shipped by the project.
- Creates the database and its parent directory if needed.
- Enables WAL, a 5000 ms busy timeout, and foreign keys.
- Applies every pending migration from `drizzle/` in a transaction.
- Logs `[funnel] database ready at <path> (<applied> migration(s) applied, <after> total)`.

Migrations are idempotent. A migration failure logs `[funnel] migration failed: <message>` and exits `1` before the server starts. `--migrate` exits `0` after a successful run; without the flag, the process continues into the adapter-node server.

The release module deliberately does not import the application environment, so `--migrate` does not require `FUNNEL_SECRET` or the GitHub settings.

## `.env` loading

Bun loads a `.env` file from the working directory automatically. For the packaged executable, that is the directory it is started in, not necessarily the directory containing the binary.

Installed services also set `FUNNEL_ENV_FILE` to an absolute config path. The standalone bootstrap loads that file before validation and migrations, with existing process variables taking precedence. This is required because Bun's runtime `--env-file` flag is not available inside a compiled executable.

The setup wizard writes the configured file (default `funnel.env`) from the embedded `.env.example`, preserves an existing `FUNNEL_SECRET`, and backs up a replaced file.

## Intake helper (`funnel-intake`)

`dist\funnel-intake.exe` is a separate, per-user Windows helper (see [Windows intake hotkey](../how-to/integrate/windows-intake-hotkey.md)). It is GUI-subsystem, takes no positional arguments, and resolves its configuration before listening:

| Flag | Behaviour |
| :--- | :--- |
| `-config` | Path to `config.json` (default `%LOCALAPPDATA%\Funnel\Intake\config.json`). |
| `-url`, `-hotkey`, `-source` | Override both the config file and the environment. |
| `-debug` | Also write logs to stderr when a console is attached. |
| `-dry-run` | Log the prefill the hotkey would open instead of launching a browser. |
| `-test` | Capture the current selection once, print the prefill, and exit. |
| `-check` | Validate the configuration and exit `0`/`1`. |
| `-version` | Print the version and exit. |

It reads `FUNNEL_URL`, `FUNNEL_HOTKEY`, and `FUNNEL_SOURCE`, logs to `%LOCALAPPDATA%\Funnel\Intake\intake.log`, and reports fatal errors in a message box because there is no console.

## Relationship to package scripts

| Entry point | Bootstrap | Flags | Migrations |
| :--- | :--- | :--- | :--- |
| `funnel` / `funnel.exe` | `runStandalone()` | Yes | Applied on every normal boot and by `--migrate` |
| `bun run start` | None; starts `build/index.js` directly | No | Not applied |
| `bun run dev` | Vite development server | No | Not applied |
| `bun run dev:demo` | Vite development server with the seeded demo database | No | Applied by the demo startup seed |
| `bun run release` | `scripts/release.ts` | No | Applied, then exits |

## Related

- [Environment variables](./environment-variables.md)
- [Build tasks](./build-tasks.md)
- [Settings](./settings.md)
- [Roles and permissions](./roles-and-permissions.md)
- [Design](../DESIGN.md)
