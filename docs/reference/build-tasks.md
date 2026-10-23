# Build tasks

This page records the mise tasks and `package.json` scripts that build, check, test, package, and install Funnel.

`mise.toml` is the single source of truth for the build, and pins Bun `1.4.3` and Go `1.27`. CI is expected to call the same tasks as local builds. `mise run` with no task name runs the `default` task, which lists the available tasks.

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
| `docker` | `docker build -t funnel:<version> .` | Local container image | `--version` defaults to `dev`. The image wraps the Linux executable. |
| `verify` | `check`, then `test`, then `intake:check`, then `build`, then `exe` | Diagnostics, test results, `build/`, and the executables | The sequence the release pipeline relies on. |
| `intake:exe` | `bun scripts/build-intake.ts` | `dist/funnel-intake.exe` | Native Windows intake hotkey helper: pure Go, no cgo, GUI subsystem. Declares `tools/funnel-intake/**`, `scripts/build-intake.ts`, `package.json`, and `bun.lock` as sources. |
| `intake:check` | `go -C tools/funnel-intake vet -unsafeptr=false ./...`, then `go -C tools/funnel-intake test ./...` | Go vet and test output | Requires the pinned Go toolchain. `-unsafeptr=false` suppresses the known false positive on the Win32 clipboard pointers. |
| `intake:install` | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-intake.ps1` | Installed per-user helper | Windows only; no elevation required. |
| `intake:uninstall` | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-intake.ps1 -Uninstall` | Removed helper | Windows only. |
| `service:install` | `powershell -NoProfile -ExecutionPolicy Bypass -File packaging/windows/install-service.ps1` | Installed Windows service | Requires an elevated prompt on Windows. |
| `service:uninstall` | `powershell -NoProfile -ExecutionPolicy Bypass -File packaging/windows/uninstall-service.ps1` | Removed Windows service | Requires an elevated prompt on Windows. |

## Target and version overrides

`exe` declares a `--target` usage flag with the environment fallback `TARGET`, defaulting to the host target. Both forms are equivalent:

```text
mise run exe --target=bun-linux-x64
TARGET=bun-linux-x64 mise run exe
```

The target selects both the compiled platform and the output name. Targets containing `windows` produce `dist/funnel.exe`; other targets produce `dist/funnel`. The task's declared output includes the target, so changing targets rebuilds rather than reusing another platform's artefact.

`docker` declares a `--version` usage flag with the environment fallback `VERSION`, defaulting to `dev`:

```text
mise run docker --version=1.2.3
VERSION=1.2.3 mise run docker
```

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
| `prepare` | `bun --bun svelte-kit sync` | Synchronises SvelteKit's generated types. A failure is swallowed by a suffix that ignores it. |
| `check` | `bun --bun svelte-kit sync && bun --bun svelte-check --tsconfig ./tsconfig.json` | Synchronises types and type-checks the project. |
| `check:watch` | `bun --bun svelte-kit sync && bun --bun svelte-check --tsconfig ./tsconfig.json --watch` | The same check in watch mode. |
| `db:push` | `bun --bun drizzle-kit push` | Pushes the Drizzle schema to the configured SQLite database. |
| `db:generate` | `bun --bun drizzle-kit generate` | Generates migration SQL under `drizzle/`. |
| `db:migrate` | `bun --bun drizzle-kit migrate` | Applies migrations through Drizzle Kit. |
| `db:studio` | `bun --bun drizzle-kit studio` | Opens Drizzle Studio against the configured database. |
| `test` | `bun test --preload ./tests/setup.ts --max-concurrency 1 --coverage src tests` | Runs the suite serially with setup preloaded and coverage enabled for `src` and `tests`. |

The Drizzle Kit scripts read `FUNNEL_DB`, defaulting to `./data/funnel.db` through `drizzle.config.ts`.

## Related

- [Command-line interface](./cli.md)
- [Environment variables](./environment-variables.md)
- [Settings](./settings.md)
- [Design](../DESIGN.md)
