# Deployment model

Funnel is deployed as one long-lived instance with a persistent data directory, as a native systemd, launchd, or Windows service (or a portable process).

## One instance is a constraint, not a default

The deployment model follows from the storage model. Funnel owns a SQLite database and opens it with `bun:sqlite`; WAL mode and a five-second busy timeout make concurrent readers and a writer work well inside one process, but they do not turn SQLite into a network database. Two replicas sharing a volume would not be a scaled Funnel — they would be two processes corrupting each other's assumptions.

The in-process services reinforce the same rule:

- the sync worker's per-repo schedule and `nextDue` map exist only in memory;
- the reconciliation timer is a `setTimeout` re-armed after each run;
- the SSE bus is a `Set` of listeners in one address space, and `clientCount()` drives the polling cadence;
- the config and auth instances are process-wide singletons.

Running two instances would duplicate polls and canonical-label writes, split the SSE audience between processes, and give each process a different view of session and settings caches. The practical guidance is therefore simple: **one replica, one data directory, no horizontal scaling**. Scale vertically if needed, and treat a restart as a brief interruption rather than as a rolling deployment with overlap.

This also has a deployment consequence that is easy to miss: a rolling upgrade that starts the new instance before the old one has stopped temporarily creates exactly the two-writer situation the design excludes. Stop first, then start. With a single instance the downtime is short and predictable; with two, the failure mode is intermittent and difficult to diagnose.

## One artefact, one installer

The executable is the only artefact. `mise run exe` compiles the adapter-node output, the Bun runtime, client assets, committed migrations and the native Markdown addon into one file (`dist/funnel` or `dist/funnel.exe`). The host needs no Node, no Bun and no container runtime.

The same executable is also the installer. `funnel setup` creates the config from `.env.example`, generates `FUNNEL_SECRET`, writes a manifest and installs a native service:

- Windows: a WinSW 2.12.0 service. The executable lives in `%ProgramFiles%\Funnel`, while configuration/data/logs default to `%ProgramData%\Funnel`.
- Linux: a systemd system or user unit with a dedicated `funnel` user for system mode.
- macOS: a LaunchDaemon with a `_funnel` user for system mode, or a LaunchAgent for user mode.

Every path is configurable during setup or by flag. The service definition sets `FUNNEL_ENV_FILE` to the chosen config file; the standalone bootstrap loads it before validation and migrations. Upgrading is `funnel upgrade --binary <path>`, which stops, replaces, restarts and rolls back on a failed health check.

Cross-compilation is possible with `--target`, but the target's native `satteri` package must be installed. Building natively per platform is the reliable path.

## The data directory

The packaged executable resolves `FUNNEL_DATA_DIR` (default `./data`), creates it, and derives `FUNNEL_DB` and `FUNNEL_UPLOAD_DIR` if they are not set. The directory contains:

- `funnel.db` — durable state, auth tables, settings and the disposable mirror in one SQLite file, plus WAL and shared-memory sidecars while running;
- `uploads/` — attachment bytes, stored under server-generated `<yyyy>/<mm>/<uuid>` paths rather than client-supplied filenames;
- the config file is separate by default (`funnel.env` in the native config directory) and is referenced through `FUNNEL_ENV_FILE`.

The distinction between durable and disposable tables matters for backup and for repair. `state_*` holds intake submissions, settings, the GitHub App credentials, work notes and attachment metadata. `auth_*` holds Better Auth users, sessions and encrypted OAuth tokens. Both must be preserved. `mirror_*` can be thrown away and rebuilt by sync. Losing the mirror costs sync time; losing `state_*`, `auth_*`, the uploads directory or `FUNNEL_SECRET` costs data or access.

`FUNNEL_SECRET` deserves special mention. It signs sessions and encrypts the GitHub App's client secret, webhook secret and private key, as well as stored OAuth tokens. A database restored without its original secret still contains the rows but cannot decrypt them. Back up the secret with the database, and do not rotate it casually on a live instance.

## Migrations on boot and in a release phase

Schema changes ship as committed Drizzle migrations under `drizzle/`. There are two supported moments to apply them.

**On boot** is the default for the executable. The generated entrypoint calls `runStandalone()` before importing `build/index.js`; `runMigrations()` opens its own SQLite connection, applies pending migrations and closes it. If migration fails, the process exits non-zero instead of serving against a half-migrated database. This is what makes a native install a single file: there is no separate release process to forget.

**In a release phase** is available for operators who want migrations to happen before the application process starts, or who run the database change as an administrative step. `funnel --migrate` applies migrations against `FUNNEL_DB` and exits; from a checkout or build stage, `bun run release` does the same. The release module deliberately does not import the application's environment or database singleton, so it can run without the app's deploy secrets and without booting SvelteKit.

Both are supported: the service migrates on boot, and `funnel --migrate` performs the same work as a separate step. Running both is harmless because migrations are idempotent and recorded in `__drizzle_migrations`.

Boot migration is a good fit for the single-instance model: there is no fleet to coordinate and no need for an external migration job. Its cost is that migration time is startup time, and a failed migration is a failed boot. The release phase is the escape hatch for a maintenance window, a pre-flight check or an environment where the application secret should not be present during schema changes.

Migrations are forward-only in practice. There is no down-migration path in the boot code, so an upgrade should be preceded by a backup, and a rollback means restoring the database and the previous binary together. Running an older binary against a newer schema is not a supported combination.

## Liveness and readiness mean different things

Funnel exposes two probes because "the process is running" and "this instance can serve traffic" are not the same question.

`/healthz` is liveness. It returns `{ status: "ok", service: "funnel" }` and touches no database, network or filesystem state. A failing dependency must not cause a supervisor to restart an otherwise healthy process; restarting Funnel will not fix a GitHub outage or a locked database, and a restart loop makes diagnosis harder.

`/readyz` is readiness. It checks that the database is reachable and, where the migrations folder can be located, that every committed migration has been applied. It returns `503` with a reason (`database not migrated` or `migrations pending`, including applied and expected counts) until then, and `200` with the counts once ready. It deliberately does not check GitHub connectivity: a cockpit that can still read its mirror is useful during a GitHub incident, so an upstream outage should not drain traffic from it.

The `funnel --healthcheck` subcommand is the operational bridge. It probes `http://127.0.0.1:${PORT}/healthz` and exits `0` or `1`, which lets the executable act as its own service health check with no shell, `curl`, or extra runtime. It probes liveness only; a load balancer that routes traffic should still use `/readyz`.

Both probes are exempt from the first-run gate, so a fresh, un-onboarded instance still answers them. This matters for the packaged executable, which may be health-checked by a supervisor before anyone has opened the onboarding wizard.

## Why serverless is not a supported target

The application cannot run on a serverless function platform without becoming a different application. It needs:

- a process that survives between requests, because the sync loop and reconciliation timer are in-process;
- long-lived SSE connections, which serverless platforms typically cap or bill differently;
- a local, writable SQLite file with WAL sidecars and file locking, not an ephemeral or read-only filesystem;
- a stable single writer, not an autoscaling set of function instances.

A cold start would also restart the schedule and lose the in-memory event bus. A platform that offers a persistent disk but scales to zero would pause sync while idle, which is recoverable but surprising; a platform that scales to multiple instances would break the single-writer assumption. The executable on a VM, a single-replica PaaS service, or a native service are the supported shapes.

## Backup, restore and upgrade

Back up the data directory as a unit, not just `funnel.db`. The uploads are separate files, and `.env` carries the secret needed to decrypt the database's App credentials and tokens. The cleanest backup is taken with the process stopped. If that is not possible, use SQLite's online backup mechanism or copy the database together with its `-wal` and `-shm` sidecars; copying only the main file while WAL holds recent commits can produce a database that is missing the newest writes.

The mirror can be excluded from a backup if space is tight, because it is rebuildable. The cost is a slower first start after restore: the cursor is derived and therefore absent, so sync falls back to a full backfill. Durable state and uploads are not optional.

Restoring is the reverse: stop the process, restore the database, uploads and secret, then start it. Readiness will stay at `503` until migrations are complete. If the restored database is older than the binary, boot or the release step applies the intervening migrations; if it is newer than the binary, restore the matching binary rather than attempting to run backwards.

Upgrading follows the same shape. Take a backup, stop the running instance (do not overlap replicas), replace the executable, start it and wait for `/readyz`, then verify the cockpit and the next sync cycle. Migrations apply automatically on boot, or can be run first with `--migrate`/`bun run release`. Sessions, settings, App credentials, work notes and uploads live in the data directory and survive the replacement. There is no auto-update mechanism in the application; the version is embedded at build time for display, and the operator owns the upgrade timing.

## Related

- [Architecture](./architecture.md) — the process, startup sequence and why the components are in-process.
- [Sync and mirror](./sync-and-mirror.md) — what a restart pauses and how sync catches up.
- [Release how-to](../how-to/contribute/release.md) — building the executable and release checks.
- [CLI reference](../reference/cli.md) — `--migrate`, `--healthcheck`, `--version` and `--help`.
- [Environment variables reference](../reference/environment-variables.md) — every deploy-time variable and its default.
- [Database schema reference](../reference/database-schema.md) — which tables are durable and which are rebuildable.
- [Production and deployment](../../README.md#production) — the repository README's operational summary.
