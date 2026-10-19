# Development

Set up a Funnel checkout, run the dev server, and find where to add routes and server modules.

## Prerequisites

- **Bun 1.4.3.** `package.json` pins `packageManager: "bun@1.4.3"` and requires `bun >=1.4.3`.
- **mise (optional).** `mise.toml` pins `bun = "1.4.3"` and defines the build tasks. If you use it, run `mise trust` once per checkout so the tasks load. Without mise, the plain `bun run …` scripts in `package.json` work the same.
- **No Node runtime for the server.** The database layer uses `bun:sqlite`, so the server must run under Bun; `node build/index.js` will not work.

## Install

```sh
bun install
```

With mise, `mise run bun:install` runs `bun install --frozen-lockfile` instead. The `prepare` script runs `svelte-kit sync` after install.

## Environment

Deploy-time values come from the environment. Copy `.env.example` to `.env` and set at least:

| Variable         | Default            | Purpose                                                        |
| :--------------- | :----------------- | :------------------------------------------------------------- |
| `FUNNEL_SECRET`  | —                  | **Required.** Encryption secret, at least 32 characters.       |
| `FUNNEL_URL`     | —                  | Public origin, e.g. `https://funnel.example.com`.              |
| `FUNNEL_DB`      | `./data/funnel.db` | SQLite database file.                                          |
| `FUNNEL_UPLOAD_DIR` | `./data/uploads` | Where uploaded attachments are stored.                         |
| `LOG_LEVEL`      | `info`             | `fatal` … `silent`.                                            |
| `GITHUB_URL` / `GITHUB_API_URL` | `https://github.com` / `https://api.github.com` | GitHub host; set both for GitHub Enterprise Server. |

The GitHub App is **not** configured through the environment. A fresh install gates every route to `/onboarding`, which walks through GitHub's App Manifest Flow; credentials are stored (encrypted under `FUNNEL_SECRET`) in the `state_github_app` table and managed afterwards in **Settings → GitHub App**.

## Dev server

```sh
bun run dev        # bun --bun vite dev, serves on http://localhost:5173
```

Instance configuration (repositories, projects, the intake default, sync cadence, board behaviour, session lifetime) lives in the SQLite database and is edited from **Settings** after signing in — not in the environment.

## Type-check

```sh
bun run check          # svelte-kit sync && svelte-check --tsconfig ./tsconfig.json
bun run check:watch    # same, in watch mode
```

With mise: `mise run check`.

## Tests

```sh
bun run test           # bun test --preload ./tests/setup.ts --max-concurrency 1 --coverage src tests
```

With mise: `mise run test`. See [testing.md](./testing.md) for what the suite covers and how to add a route test.

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

- **automatically on boot** by the packaged executable (and therefore the container), and
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

## Related

- [Testing](./testing.md)
- [Release](./release.md)
- [Build tasks reference](../../reference/build-tasks.md)
