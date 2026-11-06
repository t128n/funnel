# Architecture

Funnel is one SvelteKit server on Bun over one SQLite file. Reads are served from a local mirror; writes go to GitHub with the signed-in user's token.

## Process and storage model

The production shape is deliberately small: one long-lived `adapter-node` process owns one SQLite database and one uploads directory. There is no separate cache, queue, scheduler, or worker service.

The database is opened with `bun:sqlite` in [[src/lib/server/db/index.ts#db]], in WAL mode with a five-second busy timeout and foreign keys enabled. That import is why the server cannot run under Node and why the standalone build embeds Bun.

The mirror is a disposable cache. Durable state (`state_*`), auth state (`auth_*`), and the mirror (`mirror_*`) share the same file; [[src/lib/server/db/schema.ts]] documents the naming contract. A full re-sync can rebuild every `mirror_*` row, while `state_*` and `auth_*` must survive backup and restore.

## Request pipeline

The outer hook assigns a request id, resolves the Better Auth session, and applies the first-run gate before any route runs.

Expected failures are logged at `warn`, unexpected ones at `error` with the correlation id; the client sees generic copy rather than an internal message ([[src/hooks.server.ts#handleError]]). Responses carry `X-Robots-Tag: noindex, nofollow` because a private cockpit should never be indexed.

Cockpit pages and API routes then enforce their own guards. Layout loads call [[src/lib/server/auth/guard.ts#requireUser]]; API routes use [[src/lib/server/http/session.ts#apiRole]] or the GitHub-backed [[src/lib/server/issues/http.ts#authenticateWrite]].

## Read path

Every cockpit feed is a local SQLite query. [[src/lib/server/issues/queries.ts#allIssues]], [[src/lib/server/issues/queries.ts#inbox]], [[src/lib/server/issues/queries.ts#statusBoard]], [[src/lib/server/issues/queries.ts#matrixBoard]], and [[src/lib/server/issues/queries.ts#getIssueDetail]] join mirror rows and hydrate labels and assignees in batches. Opening a view never depends on GitHub being reachable.

The read model is local-first, not authoritative. The mirror is only as fresh as the last poll or post-write refresh, and a stale read is repaired by sync rather than by blocking the request.

## Write path

Writes take a different route from sync. A request resolves the user's GitHub user-to-server token through [[src/lib/server/auth/index.ts#getUserAccessToken]] and builds a user-token provider from [[src/lib/server/forge/providers.server.ts#forge]]. The mutation modules then call GitHub before reporting success.

Reads and background sync use the GitHub App installation token; user-initiated edits use the user's token so GitHub enforces that person's repository permissions natively. Self-healing work such as canonical labels also runs as the installation. This separation is the central authority rule of the system.

After a successful write the mutation publishes an event and the route schedules a fire-and-forget single-issue refresh with [[src/lib/server/issues/http.ts#scheduleRefresh]]. The HTTP response does not wait for the mirror to catch up.

## Startup and background work

When SvelteKit starts, [[src/hooks.server.ts#init]] runs three steps in order:

1. [[src/lib/server/github/labels.ts#provisionCanonicalLabels]] converges every configured repository's reserved labels. Failures are logged, not fatal.
2. [[src/lib/server/sync/worker.ts#startSyncWorker]] returns immediately and starts the per-repo polling loop in the background.
3. [[src/lib/server/sync/reconcile.ts#scheduleReconciliation]] arms the next 03:00 local reconciliation run.

Startup never waits for a backfill. A supervisor sees a live process even when the first sync is still running, at the cost of an initially empty or partial cockpit.

In demo mode the same hook migrates and seeds a local database instead, then skips all GitHub-contacting startup work.

## Configuration and cached singletons

Configuration is split by change cadence:

- Environment variables hold deployment facts: `FUNNEL_URL`, `FUNNEL_SECRET`, database and upload paths, GitHub hosts, logging, and onboarding token. They are declared and validated in [[src/env.ts]].
- The `state_setting` table holds what an administrator edits in `/settings`: repositories, projects, intake defaults, sync cadence, board windows, session lifetime, notifications, planning, and attention thresholds.

[[src/lib/server/config.ts#loadFunnelConfig]] merges both and validates the result with [[src/lib/server/config.ts#configSchema]]: unique shortcodes, a default intake repository that is configured, and a unique maintainer roster. [[src/lib/server/config.ts#getConfig]] memoises the promise process-wide but does not cache failures, so correcting settings takes effect without a restart.

Two other singletons follow the same lazy pattern. [[src/lib/server/auth/index.ts#getAuth]] returns `null` until onboarding stores App credentials, which is also the first-run gate's signal. [[src/lib/server/forge/providers.server.ts#forge]] caches the App, installation, and installation-id providers; resetting credentials clears those caches along with config and auth.

The first account to sign in is promoted to `admin` by [[src/lib/server/auth/index.ts#promoteFirstAdmin]]. New accounts default to `read`.

## GitHub boundary

All GitHub traffic goes through `forges`, wrapped by [[src/lib/server/forge/providers.server.ts#Forge]]. The wrapper selects the API base and web host from configuration, so the same code targets github.com or a GitHub Enterprise Server instance.

[[src/lib/server/github/manifest.ts#buildManifest]] requests only the permissions Funnel uses: issues write, metadata read, contents read, pull requests read, and checks read. It subscribes to no events and registers no webhook; polling and post-write refreshes are the only sync paths.

## First-run onboarding

The App is created in-app through GitHub's App Manifest Flow; its credentials are stored encrypted and never come from the environment.

The wizard is open on a fresh instance unless `FUNNEL_ONBOARDING_TOKEN` is set. [[src/lib/server/onboarding/access.ts#acceptOnboardingToken]] gates the wizard with a constant-time token check and a one-hour HttpOnly cookie.

## Deployment shape

The supported deployment is one instance with a persistent data directory.

The packaged executable is the only artefact: it embeds Bun, the adapter-node build, client assets, migrations, and the native Markdown addon. Details and the operational consequences are in [[operations]].

## Tests

The process and access model are pinned by [[tests/rbac.test.ts]], [[tests/sse.test.ts]], [[tests/routes.test.ts]], and [[src/standalone.test.ts]].

## Related

These sections cover the surrounding subsystems in more depth.

- [[sync]] — the polling, hydration, repair, and broadcast machinery.
- [[security]] — who may write, and with which token.
- [[workflow]] — the label vocabulary and the state it carries.
- [[operations]] — packaging, migration, health, and backup.
