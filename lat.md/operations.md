# Operations

Funnel runs as one long-lived instance with a persistent data directory. The operational model follows from that: one database, one uploads directory, in-process background work, and a packaged executable that can install itself.

## One instance, one data directory

The supported deployment is exactly one process against one SQLite file. Replicas would duplicate polling and canonical-label writes, split the SSE audience, and give each process different config and auth caches.

The standalone bootstrap in [[src/standalone.ts#runStandalone]] resolves `FUNNEL_DATA_DIR` (default `./data`) and derives `FUNNEL_DB` and `FUNNEL_UPLOAD_DIR` when they are not set. The database, its WAL sidecars, and the uploads directory should be backed up as a unit. `state_*` and `auth_*` are not optional; `mirror_*` can be rebuilt by sync.

Back up `FUNNEL_SECRET` with the database. Without it the restored App credentials and OAuth tokens cannot be decrypted, even though the rows remain.

## Migrations

Schema changes ship as committed Drizzle migrations under `drizzle/`.

- The packaged executable applies them on boot. [[src/standalone.ts#runStandalone]] calls [[src/lib/server/db/release.ts#runMigrations]] before importing the built server; a failure exits non-zero instead of serving a half-migrated database.
- The plain adapter-node build has no bootstrap. Run `mise run release` or `bun run release` first.
- `funnel --migrate` applies migrations and exits, for a separate release phase.

The migration runner opens its own connection and does not import the application environment or database singleton. Running it twice is harmless because migrations are recorded in `__drizzle_migrations`.

## Health probes

[[src/routes/healthz/+server.ts#GET]] is liveness: it returns a static ok response and touches no database, network, or filesystem state. A dependency failure should not restart an otherwise healthy process.

[[src/routes/readyz/+server.ts#GET]] is readiness: it checks that the migrations table is reachable and that every committed migration has been applied. It answers `503` with a reason until then. It deliberately does not check GitHub connectivity, because a cockpit that can still read its mirror is useful during a GitHub outage.

`funnel --healthcheck` probes `http://127.0.0.1:${PORT}/healthz` and exits `0` or `1`, letting the executable act as its own service health check. Both probes are exempt from the first-run gate, so a fresh instance still answers them.

## Packaging

The self-contained executable is the primary artefact; the adapter-node build remains supported.

`mise run exe` compiles the adapter-node output, Bun runtime, client assets, migrations, and native Markdown addon into one file (`dist/funnel` or `dist/funnel.exe`). The host needs no Node, Bun, or container runtime.

The adapter-node path remains available: `bun run build`, apply migrations, then `bun run start` (`bun ./build/index.js`). It is still a single long-lived process.

The packaged executable also acts as its installer. [[src/installer/commands/setup.ts]] creates a config file, generates `FUNNEL_SECRET` when needed, writes an install manifest, and installs a native service: WinSW on Windows, a systemd unit on Linux, and a LaunchDaemon or LaunchAgent on macOS. Portable mode runs the process without a service manager.

`funnel upgrade` replaces the binary, stops and restarts the service, and rolls back on a failed health check. The application has no auto-update mechanism; the operator owns upgrade timing. A rolling upgrade that overlaps two instances is not supported.

`mise run verify` is the release gate: type-check, tests, intake-helper vet/tests, production build, executable build, and a standalone smoke test.

## Logging

Server logs are structured through the pino-based logger in [[src/lib/server/log.ts]]. `LOG_LEVEL` selects verbosity. Request logs carry the per-request correlation id assigned in [[src/hooks.server.ts#handle]], so an unexpected error reported to a user can be matched to its server log line.

## Demo mode

Demo mode is a development-only convenience. [[src/lib/server/demo/mode.ts#isDemoMode]] reads `FUNNEL_DEMO` on every call and requires SvelteKit's compile-time `dev` flag, so a production build ignores the flag entirely.

In demo mode the `init` hook migrates the demo database and calls [[src/lib/server/demo/seed.ts#seedDemoDatabase]]. The seed writes only the normal `state_*`, `auth_*`, and `mirror_*` tables, records completion as `state_setting["demo.seeded"]`, and is idempotent. [[src/lib/server/demo/provider.ts#demoProvider]] emulates the GitHub write surface against the mirror, so the cockpit works without a network or App credentials. Delete `data/demo.db*` to reset.

## Feature flags

[[src/lib/features.ts#FEATURE_FLAGS]] is the shared registry. Flags are per browser: an override is stored in the `funnel:features` cookie, and the effective value is the override, then the instance default, then the flag's built-in default.

The registry currently covers chat-style comments, internal work notes, and the attachment dropbox. [[src/lib/server/flags.ts#resolveFeatures]] layers cookie overrides over the environment default on the server. The features page writes the cookie; there is no instance-wide switch for these three surfaces.

## Tests

Standalone boot, release migrations, packaging, demo wiring, and sync settings are covered by [[src/standalone.test.ts]], [[tests/release.test.ts]], [[tests/systemd-packaging.test.ts]], [[tests/demo-wiring.test.ts]], and [[tests/settings-sync.test.ts]].

## Related

These docs explain the process model, secrets, and sync behaviour behind operations.

- [[architecture]] — why the process must stay up.
- [[security]] — secret encryption and backup consequences.
- [[sync]] — what a restart pauses and how sync catches up.
