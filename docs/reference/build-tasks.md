# Build tasks

This page records the mise tasks and `package.json` scripts that build, check, test, package, and install Funnel.

`mise.toml` is the single source of truth for the build, and pins Bun `1.4.3` and Go `1.27`. `.github/workflows/verify.yml` runs on every push to `main` and every pull request and installs the pinned tools with `jdx/mise-action`. On `ubuntu-latest` it runs `mise run bun:install` and then the full `mise run verify` gate. On `windows-latest` it runs `mise run bun:install` and `mise run exe`, then checks that `dist\funnel.exe` exists and prints its `--version`. The full unit suite on Windows is tracked separately because the current baseline has Windows-specific failures. No build flags are duplicated in the workflow. `mise run` with no task name runs the `default` task, which lists the available tasks.

## Mise tasks

| Task | Command | Output | Notes |
| :--- | :--- | :--- | :--- |
| `default` | `mise tasks` | Task list on standard output | Lists the tasks defined in `mise.toml`. |
| `bun:install` | `bun install --frozen-lockfile` | `node_modules` from `bun.lock` | Fails if the lockfile and `package.json` disagree. |
| `check` | `bun run check` | Type-check and Svelte diagnostics | Runs `svelte-kit sync` and then `svelte-check`. |
| `test` | `bun run test` | Test results and coverage | Serial execution with `tests/setup.ts` preloaded. |
| `build` | `bun run build` | Adapter-node server in `build/` | Declares `src/**`, `static/**`, `drizzle/**`, `package.json`, `bun.lock`, `tsconfig.json`, and `vite.config.ts` as sources, and `build` as the output. |
| `release` | `bun run release` | Migration report on standard output | Applies pending migrations to the configured database. No server is started. |
| `exe` | `bun scripts/build-standalone.ts [--target=<target>]` | `dist/funnel`, or `dist/funnel.exe` for a Windows target | Depends on `build` and `intake:exe`. Declares `build/**`, `drizzle/**`, `src/standalone.ts`, `scripts/build-standalone.ts`, `scripts/standalone/**`, `package.json`, and `bun.lock` as sources. The declared output is target-aware. |
| `smoke` | `bun scripts/smoke-standalone.ts` | Smoke-test report on standard output | Depends on `exe` and exercises the built executable end to end. See [Standalone smoke test](#standalone-smoke-test). |
| `verify` | `check`, then `test`, then `intake:check`, then `build`, then `exe`, then `smoke` | Diagnostics, test results, `build/`, the executables, and the smoke report | The sequence the release pipeline relies on. |
| `intake:exe` | `bun scripts/build-intake.ts` | `dist/funnel-intake.exe` | Native Windows intake hotkey helper: pure Go, no cgo, GUI subsystem. Declares `tools/funnel-intake/**`, `scripts/build-intake.ts`, `package.json`, and `bun.lock` as sources. |
| `intake:check` | `go -C tools/funnel-intake vet -unsafeptr=false ./...`, then `go -C tools/funnel-intake test ./...` | Go vet and test output | Requires the pinned Go toolchain. `-unsafeptr=false` suppresses the known false positive on the Win32 clipboard pointers. |
| `intake:install` | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-intake.ps1` | Installed per-user helper | Windows only; no elevation required. |
| `intake:uninstall` | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-intake.ps1 -Uninstall` | Removed helper | Windows only. |

## Target and version overrides

`exe` declares a `--target` usage flag with the environment fallback `TARGET`, defaulting to the host target. Both forms are equivalent:

```text
mise run exe --target=bun-linux-x64
TARGET=bun-linux-x64 mise run exe
```

The target selects both the compiled platform and the output name. Targets containing `windows` produce `dist/funnel.exe`; other targets produce `dist/funnel`. The task's declared output includes the target, so changing targets rebuilds rather than reusing another platform's artefact.

## Standalone smoke test

`smoke` runs `scripts/smoke-standalone.ts` against the executable produced by `exe` (`dist/funnel`, or `dist/funnel.exe` on Windows). The task depends on `exe`, so `mise run smoke` builds the executable the first time; if it is still missing the script fails with a message naming `mise run exe` instead of silently rebuilding. `verify` ends with this task, so the local equivalent of the release pipeline boots and probes the same executable it ships.

The script covers the packaged contract that unit tests cannot reach:

- `--version` exits `0` and prints the `package.json` version.
- `--help` exits `0` and prints a usage line containing the documented flags.
- An unknown flag is ignored, so `--version --definitely-not-a-flag` still prints the version and exits `0` (the current contract in the [CLI reference](./cli.md#flags)).
- `--migrate` against a fresh temporary `FUNNEL_DATA_DIR` exits `0`, creates the SQLite database, and applies every committed migration under `drizzle/`. The script compares `__drizzle_migrations` with `countMigrations(drizzle/)`, then reruns `--migrate` and asserts `0 migration(s) applied` with the same total.
- The executable boots with `HOST=127.0.0.1` on an unused loopback port, and `GET /healthz` and `GET /readyz` both return `200` within a bounded timeout.
- `--healthcheck` exits `0` against the live instance and `1` after it stops.
- A termination signal stops the process within a bounded window; on POSIX a clean adapter-node shutdown (exit `0`, or `143` when the runtime handles the signal) is required.

Each run uses its own temporary data directory and removes it, along with any server process, in a `finally` block. No developer environment variables or `.env` file are required: the script supplies `FUNNEL_SECRET`, `FUNNEL_DB`, `FUNNEL_UPLOAD_DIR`, `LOG_LEVEL=silent`, and the port itself.

Windows has no POSIX `SIGTERM`, so the script uses Bun's forced process termination there and only asserts that the process is gone within the shutdown window. The `.exe` path and that signal difference are handled automatically from `process.platform`.

## Intake helper build

`intake:exe` runs `scripts/build-intake.ts`, which cross-compiles the Go module in `tools/funnel-intake` with `CGO_ENABLED=0`, `GOOS=windows`, and `GOARCH=amd64` by default, and injects the `package.json` version through `-X main.version`. The result is a GUI-subsystem executable, so no console window flashes when the hotkey fires. The script accepts `--target=windows/<arch>` and `--outdir`/`--outfile`; the mise task always writes `dist/funnel-intake.exe`.

The helper is also the source of the `intake:check` task. Its pure logic is platform-independent and tested on every OS; the Windows-only files carry `//go:build windows` constraints.

## Satteri native-addon caveat

The standalone build embeds `satteri`'s native NAPI-RS addon. Bun's compiler cannot follow the package's runtime loader chain, so `scripts/standalone/satteri-binding.ts` rewrites the `#binding` import to a static re-export of the target platform's `.node` file.

The addon comes from the optional package `@bruits/satteri-<suffix>`. `bun install` fetches only the host platform's optional package by default. A cross-target build therefore requires that target's package to be installed; without it, the build stops with a message naming the missing package. Building natively on each target platform is the supported path.

| Bun compile target | Native package suffix |
| :--- | :--- |
| `bun-windows-x64` | `win32-x64-msvc` |
| `bun-windows-arm64` | `win32-arm64-msvc` |
| `bun-linux-x64` | `linux-x64-gnu` |
| `bun-linux-arm64` | `linux-arm64-gnu` |
| `bun-linux-x64-musl` | `linux-x64-musl` |
| `bun-linux-arm64-musl` | `linux-arm64-musl` |
| `bun-darwin-x64` | `darwin-x64` |
| `bun-darwin-arm64` | `darwin-arm64` |

## `package.json` scripts

| Script | Command | Output and notes |
| :--- | :--- | :--- |
| `dev` | `bun --bun vite dev` | Vite development server with hot reload. |
| `build` | `bun --bun vite build` | Adapter-node server in `build/`. |
| `preview` | `bun --bun vite preview` | Serves the production build locally through Vite. |
| `start` | `bun ./build/index.js` | Runs the built adapter-node server under Bun. Does not run migrations or parse CLI flags. The server cannot run under Node because the database layer uses `bun:sqlite`. |
| `release` | `bun scripts/release.ts` | Applies pending migrations and prints `[release] <n> migration(s) applied — db=<path> migrations=<path> total=<n>`. |
| `build:standalone` | `bun scripts/build-standalone.ts` | Compiles the executable into `dist/`. Requires `build/index.js` to exist; accepts `--target`, `--outdir`, and `--outfile`. The default target is the host and the default output directory is `dist/`. |
| `package:release` | `bun scripts/package-release.ts --version=<version> --platform=<os>-<arch>` | Writes `release/funnel-<version>-<platform>.tar.gz` (`.zip` for Windows) plus a `<archive>.sha256`, containing the executable, `.env.example`, and on Windows the intake helper, setup launcher, and pinned WinSW. Accepts `--bin` and `--outdir` (default `release/`). |
| `fetch-winsw` | `bun scripts/fetch-winsw.ts` | Downloads the pinned WinSW 2.12.0 `WinSW.NET461.exe`, verifies SHA-256, and writes `vendor/winsw/`. Required before packaging Windows. |
| `changeset` | `changeset` | Adds a changeset for the current change. |
| `changeset:status` | `changeset status` | Shows the pending changesets and the version bump they produce. |
| `changeset:version` | `changeset version` | Applies versions and changelogs locally; normally run by the Changesets GitHub Action. |
| `prepare` | `bun --bun svelte-kit sync` | Synchronises SvelteKit's generated types. A failure is swallowed by a suffix that ignores it. |
| `check` | `bun --bun svelte-kit sync && bun --bun svelte-check --tsconfig ./tsconfig.json` | Synchronises types and type-checks the project. |
| `check:watch` | `bun --bun svelte-kit sync && bun --bun svelte-check --tsconfig ./tsconfig.json --watch` | The same check in watch mode. |
| `db:push` | `bun --bun drizzle-kit push` | Pushes the Drizzle schema to the configured SQLite database. |
| `db:generate` | `bun --bun drizzle-kit generate` | Generates migration SQL under `drizzle/`. |
| `db:migrate` | `bun --bun drizzle-kit migrate` | Applies migrations through Drizzle Kit. |
| `db:studio` | `bun --bun drizzle-kit studio` | Opens Drizzle Studio against the configured database. |
| `test` | `bun test --preload ./tests/setup.ts --max-concurrency 1 --coverage src tests` | Runs the suite serially with setup preloaded and coverage enabled for `src` and `tests`. |

The Drizzle Kit scripts read `FUNNEL_DB`, defaulting to `./data/funnel.db` through `drizzle.config.ts`.

## Changesets

Versions and changelogs are managed by [Changesets v3](https://changesets.dev). `.changeset/config.json` keeps `privatePackages.version` and `privatePackages.tag` enabled so the private application is versioned and tagged without publishing to npm. Add a changeset with `bun run changeset`; the Changesets GitHub Action opens the version PR and creates the `v<version>` tag after it merges. See [Release](../how-to/contribute/release.md#changesets) for the full flow.

## Embedded client assets

Bun's compiled filesystem exposes embedded files through `node:fs` (`existsSync`, `statSync`, `readFileSync`) and `Bun.file`, but not through `fs.createReadStream`. Adapter-node's static middleware uses `createReadStream`, so a standalone executable would serve its stylesheet and scripts as `200` responses with an empty body. `scripts/build-standalone.ts` patches that one expression in the generated `build/server/adapter-node-handler.js` to use a buffered `Readable` stream, and fails the build if adapter-node changes the pattern. The publish workflow also fetches the onboarding stylesheet from the built executable as a smoke test.

## Related

- [Command-line interface](./cli.md)
- [Environment variables](./environment-variables.md)
- [Settings](./settings.md)
- [Design](../DESIGN.md)
