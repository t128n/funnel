# Architecture

Funnel is a single long-lived Bun process that serves every cockpit view from a local SQLite mirror, sends writes to GitHub with the signed-in user's token, and keeps the mirror fresh with an in-process sync worker.

## One process, one database

The production shape is deliberately small: one SvelteKit application built with `adapter-node`, run by Bun, owning one SQLite file. There is no separate web tier, cache tier, queue, scheduler or worker service. The HTTP server, the background sync loop, the nightly reconciliation timer and the Server-Sent Events (SSE) bus all live in the same address space.

That choice follows from three things in the code:

- The database layer imports `bun:sqlite` directly (`src/lib/server/db/index.ts`). Bun is not an incidental runtime preference; `node build/index.js` cannot open the database. The standalone build embeds Bun, the adapter-node output, client assets, migrations and the native Markdown addon into one executable.
- The sync worker is a `setTimeout` loop and reconciliation is another timer (`src/lib/server/sync/worker.ts`, `src/lib/server/sync/reconcile.ts`). Both need a process that stays alive between requests.
- The SSE bus is a plain in-memory `Set` of listeners (`src/lib/server/sync/events.ts`). Fan-out to browsers is cheap precisely because there is only one process to fan out from.

A separate cache or queue would add operational surface without removing any of these constraints. The mirror already is the cache, and the cursor plus nightly sweep already provide the durability that a queue would otherwise supply. The price is that Funnel cannot be scaled horizontally. That trade is made explicitly and is discussed in [Deployment model](./deployment-model.md).

```text
                            ┌──────────────────────────────────────┐
                            │ Browser                              │
                            │ SvelteKit UI · keyboard · EventSource│
                            └───────────────┬──────────┬───────────┘
                                            │ HTTP     │ /api/events (SSE)
                                            ▼          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Funnel process (Bun + adapter-node)                                     │
│                                                                         │
│  hooks.server.ts ── request id · session · first-run gate               │
│                                                                         │
│  read path ──────── queries.ts ───────────────────► SQLite (funnel.db)  │
│                                                       ▲                 │
│  write path ── user token ──► GitHub REST             │ upserts         │
│                                                       │                 │
│  sync worker ── installation token ──► GitHub REST/GraphQL ─────────────┘
│       │                                                                 │
│       └── publish ──► in-process SSE bus ──► open cockpits              │
│                                                                         │
│  reconciliation timer (03:00 local) · label provisioning on boot        │
└─────────────────────────────────────────────────────────────────────────┘
        ▲                                        ▲
        │ environment: FUNNEL_*, GITHUB_*         │ state_setting: repos, cadence, board
        └────────────────────────────────────────┘
```

## The read path is local

Every cockpit feed — inbox, all issues, my issues, board, attention, issue detail — is a SQLite query. `src/lib/server/issues/queries.ts` joins the mirror tables and hydrates labels and assignees in batched child queries rather than making N+1 calls or talking to GitHub. The code comments call this the local read service, and the description is accurate: opening a view does not depend on GitHub being reachable or on the sync worker being awake.

This is not an offline-first application. Writes require GitHub, and the mirror is only as fresh as the last successful poll or refresh. The distinction matters: the cockpit is *local-first for reading*, not authoritative. GitHub remains the source of truth, and the mirror is explicitly disposable.

The read path also consumes instance settings — repository shortcodes, the Done window, project labels — from the cached configuration. Those reads are local too, so a settings change can take effect without a database round trip to GitHub.

## The write path uses the user's authority

Writes take a different route from sync. A request resolves the Better Auth session, obtains the signed-in user's GitHub user-to-server token through `getUserAccessToken`, and builds an Octokit client with `github.asUser(token)` (`src/lib/server/issues/http.ts`). Every mutation then calls GitHub before reporting success; GitHub's own repository permissions are the authorisation boundary, so Funnel does not reimplement per-repository access control.

This is a deliberate separation of identities:

- **Reads and background sync** use the GitHub App installation token (`funnel[bot]`). The bot can be granted Issues read/write without depending on any person being signed in.
- **Writes initiated by a person** use that person's token, so the action appears under their GitHub identity and is rejected if they lack permission.
- **Self-healing work** — creating canonical labels, removing a superseded conflicting label — uses the installation token. These are housekeeping actions, not user edits.

After a successful write the mutation publishes an `issues` event and the HTTP layer schedules a single-issue refresh in the background (`scheduleRefresh`). The response does not wait for the mirror to catch up, and a failed refresh is logged rather than failing the write. The next poll or the nightly reconciliation repairs it.

## The background worker keeps the mirror warm

The worker polls each configured repository with conditional REST requests, hydrates changed issues through GraphQL, resolves reserved-label conflicts, prunes records that no longer belong in the mirror, and publishes an event when issues change. The full mechanics and their trade-offs are in [Sync and mirror](./sync-and-mirror.md); for architecture, the important point is that this work is *in-process and best-effort*. It starts once per process, never blocks startup, and relies on the derived cursor and ETag to resume intelligently after a restart.

The SSE bus is intentionally minimal. `publish` iterates listeners, isolating a throwing listener; `clientCount` exposes the number of open streams and is also the signal that switches polling from idle to active cadence. There is no event persistence. A browser that is disconnected during a change finds the new state on its next load; an open browser that reconnects gets a fresh stream but not a replay.

## Startup sequence

Migrations run before the application is imported. The generated standalone entrypoint calls `runStandalone()`, which creates the data directory, applies pending migrations and exits on failure; only then does it import `build/index.js`. The plain adapter-node build (`bun run start`) has no bootstrap of its own: the operator is expected to run `mise run release` (or `bun run release`) as a release step first. Nothing in `build/index.js` checks migration state, so skipping that step starts the server against whatever schema the database already has.

Once SvelteKit starts, the `init` hook in `src/hooks.server.ts` does three things, in order:

1. **Provision canonical labels.** `provisionCanonicalLabels()` ensures every configured repository has the reserved Funnel labels with canonical colours and descriptions. It is awaited so the first request sees a converged vocabulary, but it swallows all failures: an unreachable GitHub, a fresh instance with no App, or missing configuration logs a warning and startup continues. During `vite build`/prerender the hook returns immediately.
2. **Start the sync worker.** `startSyncWorker()` returns immediately and begins its tick loop in the background. It is idempotent, so a second call does nothing.
3. **Schedule reconciliation.** `scheduleReconciliation()` arms a timer for the next 03:00 local time and re-arms after each run.

Startup never waits for a backfill. This is a deliberate availability choice: a large first sync should not make the process appear dead to a supervisor, and the cockpit can render whatever the mirror already holds. The cost is that a fresh instance may show an empty or partial cockpit until hydration finishes.

The **first-run gate** is separate from `init`. Each request resolves the auth singleton; if it is `null`, the instance has no GitHub App yet and every path redirects to `/onboarding`, except the wizard itself, asset paths, `/api/auth/*` (which answers 503 while unconfigured), and the health probes. This is what makes a new instance safe to expose: until onboarding creates and installs the App, there is no cockpit to reach.

## Configuration is split by change cadence

Funnel has two configuration sources, merged and validated as one object:

- **Environment** holds bootstrap and deployment facts: `FUNNEL_URL`, `FUNNEL_SECRET`, database and upload paths, `GITHUB_URL`/`GITHUB_API_URL`, logging, port and host. The GitHub hosts live here because they are bound to the deployed GitHub App and its OAuth callback wiring; they are not something a workspace administrator should change from a web form.
- **`state_setting`** holds everything an administrator edits at `/settings`: repositories and shortcodes, project label mappings, intake default repository, sync history window and cadence, board Done window and WIP limits, and session idle days. Values are JSON-encoded rows keyed by dotted paths, with per-key validation and defaults.

`loadFunnelConfig` reads both, normalises list entries and applies cross-field checks (unique shortcodes, a default intake repository that is actually configured). `getConfig` memoises the resulting promise process-wide and does not cache failures, so correcting invalid settings takes effect without a restart. Saving settings validates the merged config, writes the rows in one transaction, drops the cached promise, tells the sync scheduler to re-read its repository list, and publishes a `settings` event so open cockpits refresh.

The split is pragmatic rather than philosophical. A setting that must be known before the process can start, or that is tied to infrastructure, belongs in the environment. A setting an operator will want to tune while the process runs belongs in SQLite. Keeping the GitHub hosts on the environment side also avoids a circular problem: the GitHub App is created by the running instance, so its host cannot be discovered from the App it is meant to create.

## The auth singleton

`getAuth()` builds the Better Auth instance lazily and memoises it. The instance cannot exist until onboarding has stored GitHub App credentials in `state_github_app`; until then it resolves to `null`, which is exactly the first-run gate's signal. A failed build is not memoised, so a transient error or a newly saved App can succeed on the next call. Onboarding calls `resetAuthCache()` after saving credentials.

The singleton owns OAuth sign-in, session lookup, role enforcement and encrypted user token refresh. Sessions are read once per request in `handle` and placed on `locals`; page loads and actions do not repeat the lookup. The first user to sign in is promoted to `admin` so a fresh instance has an owner; new accounts default to `read`. The session idle window is read from settings when the auth instance is built, which is why a change to `session.idle_days` applies to new sessions after a credential reset or restart rather than instantly.

## Why there is no separate cache, queue or broker

The absence is a design position, not an unfinished feature.

- **The mirror is the cache.** It is rebuildable from GitHub, and re-sync is the invalidation strategy. A second cache would create a second consistency problem.
- **The scheduler is the queue.** Polling is idempotent and the work is derived from GitHub state, so there is no job payload to lose. A missed cycle is repaired by the next poll or the nightly full sweep. A queue would add delivery guarantees for work that is already safe to repeat.
- **The bus is in-process because the process is the deployment.** SSE fan-out is a `Set` iteration. An external broker would only be needed if there were multiple processes, which the SQLite ownership model rules out.
- **One file is one backup.** Durable state, auth state, settings and the mirror share `funnel.db`; uploads are the only other data directory. This is a real operational benefit for a self-hosted tool.

The trade-offs are equally real: no horizontal scaling, no independent worker scaling, no event replay, and a restart pauses sync and closes every SSE stream. Those are acceptable for a private cockpit serving a team, and they are the reason the deployment model insists on exactly one instance.

## Related

- [Sync and mirror](./sync-and-mirror.md) — polling, hydration, conflict resolution and pruning.
- [Deployment model](./deployment-model.md) — why one instance, how it is packaged and upgraded.
- [Design principles](./design-principles.md) — the UI standards the cockpit is built to.
- [Environment variables reference](../reference/environment-variables.md) — the deploy-time variables that sit alongside `state_setting`.
- [Release how-to](../how-to/contribute/release.md) — building the adapter-node server and executable.
- [Production and deployment](../../README.md#production) — operational summary in the repository README.
