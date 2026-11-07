# Development

Set up a Funnel checkout, run the dev server, and find where to add routes and server modules.

## Get a checkout

For an installed instance rather than source development, use the [installation guide](../deploy/install.md). For development, install Git and [mise](https://mise.jdx.dev), then clone the public repository:

```sh
git clone https://github.com/t128n/funnel.git
cd funnel
```

The checkout contains `package.json`, `mise.toml`, `src/` and `drizzle/`. If you will contribute from a fork, add your fork as a remote and push your branch there.

Trust the project configuration and install its pinned tools:

```sh
mise trust
mise install
bun --version
```

`bun --version` should print `1.4.3`; `mise.toml` also pins Go and Node for the build tooling. The server itself must run under Bun because it uses `bun:sqlite`.

Install the locked dependencies:

```sh
mise run bun:install
```

This runs `bun install --frozen-lockfile`; it should finish without errors and create `node_modules/`. The install's `prepare` script synchronises SvelteKit. Without mise, use Bun 1.4.3 and run `bun install --frozen-lockfile` directly.

## Run with demo data

For an offline development instance, start the demo from the checkout root:

```sh
bun run dev:demo
```

Vite prints a local URL, normally <http://localhost:5173/>. Open it to see a signed-in demo admin and seeded issues, without GitHub App onboarding. The first run migrates and seeds the demo database; later runs retain edits. Stop the server with Ctrl+C.

The launcher defaults to `data/demo.db`, `data/demo-uploads`, and a development-only secret **only when the corresponding environment variables are unset or blank**. Check `FUNNEL_DB`, `FUNNEL_UPLOAD_DIR`, and `FUNNEL_SECRET` in your shell and `.env` before starting: do not point demo mode at real data or reuse its secret for a real instance. Demo mode is ignored by production builds and is not a packaged executable option.

To reset the default demo database, stop the server and delete only its database and SQLite sidecar files:

```sh
rm -f data/demo.db data/demo.db-shm data/demo.db-wal
```

The next demo run recreates and seeds it. If you configured another demo database path, inspect that path before deleting anything.

## Run with a real GitHub App

Use a separate local database and a GitHub account permitted to create and install an App. If `.env` already exists, retain it rather than overwriting it. Otherwise, from the checkout root, create an environment file and generate a secret:

```sh
cp .env.example .env
openssl rand -base64 32
```

The copy creates `.env`; OpenSSL prints a secret. Put that value in `.env` as `FUNNEL_SECRET` (at least 32 characters) and keep the file and secret private. Leave `FUNNEL_URL` empty for localhost; set it to the public origin for a non-local host. If others can reach a fresh instance, set `FUNNEL_ONBOARDING_TOKEN` to protect onboarding. GitHub App credentials are created through the wizard and encrypted in the database, not set in `.env`.

Apply the committed migrations:

```sh
bun run release
```

The `[release]` report identifies the database and number of migrations applied; the default is `./data/funnel.db`. Then start the server:

```sh
bun run dev
```

Vite prints a local URL, normally <http://localhost:5173/>. Open `/onboarding` and follow [GitHub App onboarding](../configure/onboard-github-app.md); a fresh instance shows the setup wizard, then lets you sign in after the App is installed. Stop the server with Ctrl+C. For GitHub Enterprise Server, set both `GITHUB_URL` and `GITHUB_API_URL` first; see the [environment reference](../../reference/environment-variables.md).

Instance configuration such as repositories and sync cadence is edited in **Settings** after sign-in.

## Type-check

```sh
bun run check          # svelte-kit sync && svelte-check --tsconfig ./tsconfig.json
bun run check:watch    # same, in watch mode
```

A successful run exits with no type errors. With mise: `mise run check`.

## Tests

```sh
bun run test           # bun test --preload ./tests/setup.ts --max-concurrency 1 --coverage src tests
```

A successful run exits zero after the coverage gate. With mise: `mise run test`. See [testing.md](./testing.md) for what the suite covers and how to add a route test.

## Database commands

| Command              | Runs                    | Purpose                                                        |
| :------------------- | :---------------------- | :------------------------------------------------------------- |
| `bun run db:generate` | `drizzle-kit generate` | Generate a new migration from `schema.ts` into `drizzle/`.     |
| `bun run db:migrate`  | `drizzle-kit migrate`  | Apply pending migrations to `FUNNEL_DB`.                       |
| `bun run db:studio`   | `drizzle-kit studio`   | Open Drizzle Studio against the database.                      |
| `bun run db:push`     | `drizzle-kit push`     | Push the schema directly (development convenience).            |

`drizzle.config.ts` sets the output folder to `./drizzle`, the schema to `src/lib/server/db/schema.ts`, the dialect to `sqlite`, and the credentials URL to `process.env.FUNNEL_DB || "./data/funnel.db"`.

### Migrations

Schema changes ship as **committed SQL** under `drizzle/<timestamp>_<name>/migration.sql` (the drizzle-kit v1 layout — there is no `meta/_journal.json`). Generate them with `bun run db:generate` and commit the result; do not hand-edit application tables at runtime. They are applied:

- **automatically on boot** by the packaged executable, and
- **manually** for a separate release phase via `mise run release` / `bun run release`, or `./funnel --migrate`.

Tests run the committed migration against an in-memory database (see `tests/setup.ts`), so the schema the tests exercise is the one the server gets.

## Code layout

| Path                          | Contents                                                                                     |
| :---------------------------- | :------------------------------------------------------------------------------------------- |
| `src/routes/`                 | SvelteKit routes: pages (`.svelte`, `+page.server.ts`) and JSON endpoints (`+server.ts`).    |
| `src/routes/api/`             | The HTTP API. Unknown paths fall through to `[...rest]/+server.ts`, which returns a JSON 404.|
| `src/lib/`                    | Shared code usable on client and server (`intake-prefill.ts`, `roles.ts`, `features.ts`, …). |
| `src/lib/client/`             | Browser-only code (deeplinks, hotkeys, optimistic stores).                                   |
| `src/lib/server/`             | Server-only modules: `db/`, `intake/`, `sync/`, `github/`, `auth/`, `http/`, `issues/`, `settings/`, `markdown/`, `attachments/`, `onboarding/`, `crypto/`. |
| `src/env.ts`, `src/hooks.server.ts`, `src/standalone.ts` | Env schema, request hooks, and the standalone-executable bootstrap.        |
| `scripts/`, `packaging/`      | Build helpers and the Windows service installer.                                             |
| `tests/`, `src/**/*.test.ts`  | The Bun test suite (see [testing.md](./testing.md)).                                         |

Path aliases (from `tsconfig.json` and `package.json` `imports`): `#/*` → `src/*`, `#lib/*` → `src/lib/*`, `#tests/*` → `tests/*`.

## Where to add routes and server modules

**A new HTTP endpoint:** add `src/routes/api/<path>/+server.ts` exporting the handlers you need (`GET`, `POST`, `PATCH`, `DELETE`, `OPTIONS`). Keep the route thin and put behaviour in a server module under `src/lib/server/`, imported via `#lib/server/...`.

> SvelteKit's build-time export check rejects non-endpoint exports from `+server.ts`. Put schemas and helpers in their own module — `src/lib/server/intake/schema.ts` exists precisely so both the handler and `tests/openapi.test.ts` can import the schema.

**A new server module:** place it under the matching `src/lib/server/<area>/` directory and import it with `#lib/server/<area>/<module>`. Keep database access and secrets server-only; keep browser-only code under `src/lib/client/`.

## Submit a change

1. Create a branch, for example `git switch -c fix/short-description`, and make a focused change. `git status --short` shows the changed files; include any generated migration with its schema change.
2. Run `bun run check` and `bun run test`; both should exit successfully. For documentation changes, run `bun run docs:build` to build the site and check links. See [testing](./testing.md) for more targeted tests.
3. For a user-facing change, run `bun run changeset`, choose `patch` while the project is on the `0.0.x` line, and write a user-facing summary. A new file appears under `.changeset/`; include it in the change. Tooling-only changes may omit a changeset; see [release](./release.md#changesets) for the empty changeset and versioning rules. Do not edit the package version or changelog by hand.
4. Review `git diff`, commit your branch, and push it to a repository you can write to. Your branch should appear on GitHub; never include `.env`, credentials, or local database files.
5. Open a pull request against `t128n/funnel`'s `main` branch. Describe the change, why it is needed, and the checks run (including failures or checks not run). The pull request is ready for review; respond to feedback and update the branch as needed.

Next, use the [testing guide](./testing.md) to extend coverage, or the [release guide](./release.md) to understand how a merged change is versioned.

## Related

- [Testing](./testing.md)
- [Release](./release.md)
- [Build tasks reference](../../reference/build-tasks.md)
