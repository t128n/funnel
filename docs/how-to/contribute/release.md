# Release

Build and ship Funnel's artefacts — the adapter-node server, the self-contained executable, and the container image — from the single source of truth in `mise.toml`.

## Prerequisites

- **mise**, trusted once per checkout (`mise trust`) so its tasks load. If you do not use mise, the underlying `bun run` scripts in `package.json` are equivalent.
- **Bun 1.4.3** (pinned by `mise.toml`).
- **Go 1.27** for the optional Windows intake helper (also pinned by `mise.toml`).
- **Docker**, only for the container path.

## Tasks

`mise.toml` is the single source of truth for the build: local development and any CI (GitHub Actions, Jenkins, …) call the same tasks, so nothing important lives only in a pipeline definition.

| Task                | Runs                              | Produces |
| :------------------ | :-------------------------------- | :------- |
| `mise run verify`   | `check` → `test` → `intake:check` → `build` → `exe` | Everything the release pipeline relies on. |
| `mise run check`    | `bun run check`                   | Type-check. |
| `mise run test`     | `bun run test`                    | The test suite (see [testing.md](./testing.md)). |
| `mise run intake:check` | `go vet` → `go test`          | The intake helper's Go vet and test results. |
| `mise run build`    | `bun run build`                   | Production SvelteKit build in `build/`. |
| `mise run exe`      | `bun scripts/build-standalone.ts`, plus `intake:exe` | Self-contained executable in `dist/`, and `dist\funnel-intake.exe`; depends on `build`. |
| `mise run intake:exe` | `bun scripts/build-intake.ts`   | Native Windows intake helper in `dist\funnel-intake.exe`. |
| `mise run docker`   | `docker build -t funnel:<version> .` | Container image (secondary / PaaS target). |
| `mise run release`  | `bun run release`                 | Applies pending migrations (the release phase). |

Overrides documented in `mise.toml`:

```sh
mise run exe --target=bun-linux-x64   # cross-target (needs that platform's satteri package)
TARGET=bun-linux-x64 mise run exe     # same, via the environment
mise run docker --version=1.2.3
VERSION=1.2.3 mise run docker
```

## Version source

The version lives in **`package.json`** (`"version"`). It is read at build time by `vite.config.ts` into `__APP_VERSION__` (shown in the public `/intake` page footer) and by `scripts/build-standalone.ts` when compiling the executable (`--version` prints it). Bump `package.json` before building a release; pass `--version`/`VERSION` to `mise run docker` to tag the image.

## Migrations

Schema changes ship as **committed SQL** under `drizzle/<timestamp>_<name>/migration.sql`. Generate a migration with `bun run db:generate`, review it, and commit it with the schema change — never as a manual runtime step.

They are applied:

- **automatically on boot** by the packaged executable (and therefore the container), before it starts listening, and
- **manually** for a separate release phase: `mise run release` (`bun run release`) or `./funnel --migrate` against `FUNNEL_DB`.

`src/lib/server/db/release.ts` is deliberately independent of the app environment and the `db` singleton: it opens its own `bun:sqlite` connection, so the release step can run before the server boots and without the deploy secrets. The database path comes from `FUNNEL_DB` (default `./data/funnel.db`); the migrations folder from `FUNNEL_MIGRATIONS_DIR`, else from candidates covering an embedded executable, an adapter-node deploy, and a source checkout. `runMigrations()` is idempotent and wrapped in transactions; `/readyz` reports `503` until every committed migration has been applied.

`bun run release` (`scripts/release.ts`) prints a report:

```text
[release] <n> migration(s) applied — db=… migrations=… total=…
```

On a PaaS use it as the release / pre-deploy command. The runtime container has no Bun or source tree, so apply migrations there with `docker run --rm <image> --migrate` instead. The packaged executable runs the same step on boot.

## Standalone executable data defaults

The standalone bootstrap (`src/standalone.ts`) points the app at a writable data directory before the server loads. It only fills variables that are unset:

| Variable            | Default                          |
| :------------------ | :------------------------------- |
| `FUNNEL_DATA_DIR`   | `./data` (resolved from the working directory; created if missing) |
| `FUNNEL_DB`         | `<data dir>/funnel.db`           |
| `FUNNEL_UPLOAD_DIR` | `<data dir>/uploads`             |

The Windows service sets `FUNNEL_DATA_DIR` to `C:\ProgramData\Funnel` and runs with that directory as its working directory, so state — `funnel.db`, `uploads/`, `.env` — lives there. The container sets `FUNNEL_DATA_DIR=/data`, which should be a mounted volume.

The executable also handles `--migrate`, `--healthcheck` (probes `/healthz`), `--version`, and `--help`.

## Artefact locations

| Artefact              | Path                                  | Notes |
| :-------------------- | :------------------------------------ | :---- |
| adapter-node server   | `build/`                              | Run with `bun ./build/index.js` (`bun run start`); client assets in `build/client`. |
| Standalone executable | `dist/funnel` (Linux/macOS), `dist/funnel.exe` (Windows) | One file: Bun runtime, adapter-node output, dependencies, client assets, and `drizzle/` migrations embedded. |
| Intake helper         | `dist\funnel-intake.exe` (Windows)    | Optional per-user hotkey helper; pure Go, no cgo. Built by `intake:exe`, which `exe` also runs. |
| Container image       | tagged `funnel:<version>`             | Built from `Dockerfile`; compiles the Linux executable and copies it to `/usr/local/bin/funnel`; `ENTRYPOINT ["/usr/local/bin/funnel"]`, `VOLUME /data`, healthcheck via `funnel --healthcheck`. |

`scripts/build-standalone.ts` accepts `--target=<bun-target>`, `--outdir=<dir>` (default `dist`), and `--outfile=<name>` (default `funnel`, or `funnel.exe` for a Windows target). Cross-target builds need that platform's `satteri` package installed, so building natively per OS is the reliable path.

## Release procedure

1. Bump `version` in `package.json`.
2. If the schema changed, run `bun run db:generate` and commit the new `drizzle/<timestamp>_<name>/` directory.
3. Run `mise run verify` locally (check + test + intake:check + build + exe).
4. Build the artefacts: `mise run build`, `mise run exe`, and `mise run docker --version=<version>`.
5. Deploy the executable or image:
   - **Windows:** stop the service, replace `funnel.exe`, start it — migrations run automatically on boot.
   - **Container / PaaS:** mount the `/data` volume, or run the separate release phase (`mise run release` against the same `FUNNEL_DB`, or `<image> --migrate`) before starting the new version.
6. Confirm `/healthz` (liveness) and `/readyz` (readiness, `503` until migrations are applied) after the rollout.

Funnel is a **single instance**: it owns one SQLite file, so do not scale it horizontally or run multiple replicas against one volume.

## CI guidance

There is no committed pipeline configuration; `mise.toml` is the contract. Have CI run `mise run verify` for correctness and `mise run docker --version=<version>` (or `mise run exe`) to produce artefacts, so local and CI builds are identical. Run `mise trust` once per checkout before invoking the tasks.

## Related

- [Build tasks reference](../../reference/build-tasks.md)
- [Testing](./testing.md)
- [Development](./development.md)
