# Testing

Run and extend Funnel's Bun test suite, which exercises the routes, server modules, and shared helpers against one in-memory database.

## Running the suite

```sh
bun run test
```

That expands to:

```sh
bun test --preload ./tests/setup.ts --max-concurrency 1 --coverage src tests
```

With mise: `mise run test`.

| Flag                          | Why                                                                                          |
| :---------------------------- | :------------------------------------------------------------------------------------------- |
| `--preload ./tests/setup.ts`  | Mocks SvelteKit's virtual `$app/env` modules, migrates the in-memory DB, and seeds the test GitHub App **before** any test file loads. |
| `--max-concurrency 1`         | Files run one at a time because they share a single in-memory database and process-wide caches. |
| `--coverage src tests`        | Collects coverage over `src` and `tests`.                                                    |

## What the preload sets up

`tests/setup.ts` runs before any test file:

- Mocks `$app/env/private` with deterministic values — `FUNNEL_DB: ":memory:"`, `LOG_LEVEL: "silent"`, `FUNNEL_UPLOAD_DIR: "./.test-uploads"`, Cloud GitHub hosts.
- Mocks `$app/env` with `dev: true`, `building: false`, `browser: false`.
- Applies the **committed** Drizzle migration to the in-memory DB (`drizzle/`), so tests exercise the same schema the server gets from `bun run db:migrate`.
- Seeds the test GitHub App via `seedTestGithubApp()` from `tests/github-app.ts` (a real 2048-bit RSA keypair so JWT signing works offline).

## Database isolation

Bun runs every test file in **one process against one in-memory database**, so there is no per-file database. Isolation is by convention: each test cleans the tables it touches in `beforeEach`, for example:

- `tests/intake.test.ts` and `staging.test.ts` call `db.delete(stateIntakeSubmission).run()`.
- Sync/mirror suites call `clearMirror()` from `tests/mirror-helpers.ts`, which wipes every disposable `mirror_github_*` table (children before parents).
- Route suites seed users by inserting into `auth_user` / `auth_account`, and use a repository name unique to the file so they do not collide with the process-wide installation-id cache.

If a test clears the GitHub App credentials, re-seed them with `seedTestGithubApp()` in `afterEach` so later files keep working.

## What the tests cover

| Group             | Files                                                                                  | What they cover |
| :---------------- | :------------------------------------------------------------------------------------- | :-------------- |
| Config & settings | `src/lib/server/config.test.ts`, `settings/store.test.ts`, `settings/apply.test.ts`   | Config loading, validation, caching, and the settings store. |
| Filters           | `src/lib/server/issues/filters.test.ts`, `queries.test.ts`, `detail.test.ts`, `mutations.test.ts`, `src/lib/components/issue/grouping.test.ts`, `src/lib/url-filter.test.ts` | Issue filter parsing/`WHERE` building, queries, and grouping. |
| Intake            | `tests/intake.test.ts`, `tests/intake-prefill.test.ts`, `tests/intake-deeplink.test.ts`, `src/lib/server/intake/staging.test.ts`, `intake/actions.test.ts`, `tests/inbox-projection.test.ts` | The `POST /api/intake` route, prefill limits, deeplink round-tripping, the staging store, triage actions, and Inbox optimistic projection. |
| RBAC              | `tests/rbac.test.ts`                                                                   | Role ranking, `apiRole`/`apiSession` guards, and the first-admin bootstrap. |
| Routes            | `tests/routes.test.ts`, `tests/issues-routes.test.ts`, `tests/mirror-issues-route.test.ts` | Read routes (list/detail/comments/labels/user/auth) with `fetch` stubbed, write routes driven by a seeded user token, and the Inspector's mirror read path. |
| SSE               | `tests/sse.test.ts`, `src/lib/server/sync/events.test.ts`                              | `/api/events` headers, heartbeat, and event framing; the in-process event bus. |
| Work notes        | `tests/work-notes-routes.test.ts`, `src/lib/server/work-notes.test.ts`, `attachments/store.test.ts` | Work-note create/edit/delete/publish routes, and the attachment store. |
| OpenAPI drift     | `tests/openapi.test.ts`                                                                | Compares `static/openapi.yml` to the JSON Schema derived from `intakeSchema`, and that every local `$ref` resolves. |
| Error routes      | `tests/error-routes.test.ts`                                                           | The `/api` catch-all returns a JSON 404, never the HTML error page. |
| Hotkeys           | `tests/hotkeys.test.ts`                                                                | Every default hotkey is valid and no two actions share a binding. |
| Mirror & sync     | `src/lib/server/sync/{mirror,hydrate,reconcile,worker,conflicts}.test.ts`, `tests/mirror-issues-route.test.ts` | Mirror upserts, hydration, reconciliation, the polling worker, and conflict detection. |
| Release migrations | `tests/release.test.ts`                                                               | The release/admin migration runner and folder resolution, including `bun run release` against a temp database. |

Other suites cover feature flags (`tests/flags.test.ts`, `src/lib/features.test.ts`), the GitHub layer (`src/lib/server/github/*.test.ts`), Markdown rendering, auth, onboarding access, logging, crypto secrets, and small shared helpers (`seo`, `time`, `errors`, `issue-url`, `issue-ref`, `attention`, `funnel-metadata`).

## How to write a route test

Route tests import the handler directly and call it with a fake SvelteKit event, stubbing the network at the `fetch` boundary.

1. **Import the handler** by alias, e.g. `import { POST } from "#/routes/api/intake/+server";`.
2. **Call it with an event-shaped object** cast `as never`. Suites pass only the fields the handler reads, e.g. `POST({ request, params, url, locals } as never)`.
3. **Stub `globalThis.fetch`** to intercept the GitHub API; save and restore the real `fetch` in `beforeEach`/`afterEach`.
4. **Seed configuration** with `setConfig(TEST_CONFIG)` from `tests/test-config.ts` in `beforeEach` (use `GHE_CONFIG` to exercise a GitHub Enterprise host). Reset caches such as `resetAppCache()` and `clearPassthroughCache()`.
5. **Seed mirror state** with `upsertRepo` / `upsertIssue` from `#lib/server/sync/mirror` and clear it with `clearMirror()` from `tests/mirror-helpers.ts`.
6. **Supply a session** by passing `locals: { user: { id, role }, session: null }` — read routes need a `read` session, write routes a `write` or `admin` one.

A GitHub App is always available because `tests/setup.ts` seeds one; use `tests/github-app.ts` when a test needs to seed or re-seed it explicitly.

## Related

- [Development](./development.md)
- [Release](./release.md)
- `tests/setup.ts`, `tests/test-config.ts`, `tests/github-app.ts`, `tests/mirror-helpers.ts`
