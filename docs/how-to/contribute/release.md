# Release

Build and ship Funnel's artefacts — the adapter-node server and the self-contained executable — from the single source of truth in `mise.toml`.

## Prerequisites

- **mise**, trusted once per checkout (`mise trust`) so its tasks load. If you do not use mise, the underlying `bun run` scripts in `package.json` are equivalent.
- **Bun 1.4.3** (pinned by `mise.toml`).
- **Go 1.27** for the optional Windows intake helper (also pinned by `mise.toml`).

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
| `mise run release`  | `bun run release`                 | Applies pending migrations (the release phase). |

Overrides documented in `mise.toml`:

```sh
mise run exe --target=bun-linux-x64   # cross-target (needs that platform's satteri package)
TARGET=bun-linux-x64 mise run exe     # same, via the environment
```

## Version source

The version lives in **`package.json`** (`"version"`). It is read at build time by `vite.config.ts` into `__APP_VERSION__` (shown in the public `/intake` page footer) and by `scripts/build-standalone.ts` when compiling the executable (`--version` prints it).

Do not bump it by hand. **Changesets** owns the version: a user-facing change adds a changeset, and the Changesets GitHub Action opens a version PR that updates `package.json` and `CHANGELOG.md`. Merging that PR produces the `v<version>` tag and starts the executable release pipeline.

## Migrations

Schema changes ship as **committed SQL** under `drizzle/<timestamp>_<name>/migration.sql`. Generate a migration with `bun run db:generate`, review it, and commit it with the schema change — never as a manual runtime step.

They are applied:

- **automatically on boot** by the packaged executable, before it starts listening, and
- **manually** for a separate release phase: `mise run release` (`bun run release`) or `./funnel --migrate` against `FUNNEL_DB`.

`src/lib/server/db/release.ts` is deliberately independent of the app environment and the `db` singleton: it opens its own `bun:sqlite` connection, so the release step can run before the server boots and without the deploy secrets. The database path comes from `FUNNEL_DB` (default `./data/funnel.db`); the migrations folder from `FUNNEL_MIGRATIONS_DIR`, else from candidates covering an embedded executable, an adapter-node deploy, and a source checkout. `runMigrations()` is idempotent and wrapped in transactions; `/readyz` reports `503` until every committed migration has been applied.

`bun run release` (`scripts/release.ts`) prints a report:

```text
[release] <n> migration(s) applied — db=… migrations=… total=…
```

Use it as the release / pre-deploy command when you run migrations separately. The packaged executable runs the same step on boot.

## Standalone executable data defaults

The standalone bootstrap (`src/standalone.ts`) points the app at a writable data directory before the server loads. It only fills variables that are unset:

| Variable            | Default                          |
| :------------------ | :------------------------------- |
| `FUNNEL_DATA_DIR`   | `./data` (resolved from the working directory; created if missing) |
| `FUNNEL_DB`         | `<data dir>/funnel.db`           |
| `FUNNEL_UPLOAD_DIR` | `<data dir>/uploads`             |

The installed service sets `FUNNEL_DATA_DIR` and `FUNNEL_ENV_FILE` in its service definition. On Windows the defaults are `C:\ProgramData\Funnel`; on Linux and macOS the installer uses the paths chosen during `funnel setup`.

The executable also handles `--migrate`, `--healthcheck` (probes `/healthz`), `--version`, and `--help`.

## Artefact locations

| Artefact              | Path                                  | Notes |
| :-------------------- | :------------------------------------ | :---- |
| adapter-node server   | `build/`                              | Run with `bun ./build/index.js` (`bun run start`); client assets in `build/client`. |
| Standalone executable | `dist/funnel` (Linux/macOS), `dist/funnel.exe` (Windows) | One file: Bun runtime, adapter-node output, dependencies, client assets, and `drizzle/` migrations embedded. |
| Intake helper         | `dist\funnel-intake.exe` (Windows)    | Optional per-user hotkey helper; pure Go, no cgo. Built by `intake:exe`, which `exe` also runs. |

`scripts/build-standalone.ts` accepts `--target=<bun-target>`, `--outdir=<dir>` (default `dist`), and `--outfile=<name>` (default `funnel`, or `funnel.exe` for a Windows target). Cross-target builds need that platform's `satteri` package installed, so building natively per OS is the reliable path.

## Changesets

Funnel uses [Changesets v3](https://changesets.dev) for versioning and
changelogs. The package is private, so nothing is published to npm; Changesets
is configured to version and tag private packages:

```json
{
  "privatePackages": { "version": true, "tag": true }
}
```

Add a changeset in the same pull request as any user-facing change:

```sh
bun run changeset
```

The prompt asks for the bump type (`patch`, `minor`, or `major`) and a summary.
Commit the generated file under `.changeset/`. A change that does not need a
release can use an empty changeset (`bun run changeset --empty`), and tooling-only
changes may omit one. Do not edit `package.json`'s version or `CHANGELOG.md` by
hand.

**The 0.0.x line is patch-only.** Funnel reserves `0.1.0` for the first normal
release, so every pre-release changeset uses `patch`; features do not require a
`minor` bump before that point. The changesets workflow runs
`bun run changeset:check`, which fails if a pending changeset is `minor` or
`major` while the package is still `0.0.x`. Preparing `0.1.0` is the deliberate
exception; run the check with `--allow-minor` for that release only.

`bun run changeset:status` shows the pending release. `bun run changeset:version`
applies versions and changelogs locally; CI normally does this in a version PR.
`bun run changeset:check` is the pre-release bump guard.

## Release procedure

1. Add a changeset to the pull request (`bun run changeset`) and merge the PR to `main`.
2. `.github/workflows/changesets.yml` opens or updates a **`chore: version packages`** pull request. Review the version and `CHANGELOG.md` entry.
3. Merge the version PR. The same workflow then:
   - runs `changeset publish` in tag-only mode, which creates the `v<version>` tag, and
   - calls the publish workflow for that tag.
4. The publish workflow verifies, builds, packages, and creates the GitHub release. Releases in the `0.0.x` line are marked **pre-release**; `0.1.0` is the first normal release, and later versions are normal unless they carry an explicit suffix such as `-rc.1`.
5. If the schema changed, make sure the new `drizzle/<timestamp>_<name>/` directory was committed with the change (`bun run db:generate`).
6. Deploy the executable or image:
   - **Windows:** stop the service, replace `funnel.exe`, start it — migrations run automatically on boot.
7. Confirm `/healthz` (liveness) and `/readyz` (readiness, `503` until migrations are applied) after the rollout.

You can still build artifacts locally before merging: `mise run verify`,
`mise run build` and `mise run exe`.

Funnel is a **single instance**: it owns one SQLite file, so do not scale it horizontally or run multiple replicas against one volume.

## Release pipeline

Two workflows split versioning from artifact publishing:

- **`.github/workflows/changesets.yml`** runs on pushes to `main`. It selects
  `version` when changesets are pending (opening the version PR), `publish`
  when the version PR was merged and no changesets remain, and `none`
  otherwise. In publish mode it creates the git tag with
  `changesets/action/publish@v2` (`create-github-releases: false`,
  `push-git-tags: true`) and calls the publish workflow with that tag. A
  reusable-workflow call is used because tags pushed with `GITHUB_TOKEN` do not
  trigger a separate tag workflow.
- **`.github/workflows/publish.yml`** accepts that tag, or a manually pushed
  `v*` tag, and runs:
  1. **Validate** — rejects a tag that does not match the `version` in `package.json`.
  2. **Verify** — `bun run check`, `bun run test`, and the intake helper's `go vet`
     and `go test`.
  3. **Build** — native executables for Linux x64, Linux arm64, macOS Apple
     silicon, macOS Intel, and Windows x64. Linux arm64 is cross-compiled on the
     x64 runner after installing that target's `satteri` optional package.
  4. **Smoke test** — runs `--version` and `--migrate`, and requests the
     onboarding page plus its stylesheet from the executable to catch missing
     embedded assets.
  5. **Package** — `bun run package:release` (`scripts/package-release.ts`) writes
     `funnel-<version>-<platform>.tar.gz` (`.zip` on Windows), including
     `.env.example`, plus a per-asset `.sha256`.
  6. **Publish** — merges the checksums into `SHA256SUMS.txt` and creates or
     updates a GitHub release. The body comes from the Changesets
     `CHANGELOG.md` entry (`scripts/release-notes.ts`), with
     `.github/release-notes/<tag>.md` as a fallback for releases that predate
     Changesets.

Build jobs call the same `bun run build` and `bun scripts/build-standalone.ts`
commands as `mise run exe`, so a release artefact is the same build a local
checkout produces.

## Related

- [Build tasks reference](../../reference/build-tasks.md)
- [Testing](./testing.md)
- [Development](./development.md)
