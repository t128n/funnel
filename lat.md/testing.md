# Testing

Tests run under Bun with a migrated in-memory SQLite database. The suite covers pure domain logic, mirror and sync behaviour, HTTP routes, and the documentation and design contracts that guard the project.

## Test stack

`package.json` runs `bun test --preload ./tests/setup.ts --max-concurrency 1 --coverage src tests`, followed by `bun scripts/check-coverage.ts`. `mise run test` is the same entry point.

Files run serially because the database and the SSE bus are process-global. A test that leaves a subscriber behind would otherwise leak into the next file.

## Preloaded environment

[[tests/setup.ts]] runs before any test module loads:

- it mocks `$app/env/private` and `$app/env` so Vite/SvelteKit virtual modules resolve under `bun test`;
- it opens the in-memory database at `:memory:` and applies the committed Drizzle migrations, so tests exercise the same schema the server receives;
- it seeds a GitHub App in `state_github_app` through [[tests/github-app.ts#seedTestGithubApp]], after the environment mock so the credential store can derive its encryption key;
- it resets the SSE bus before every test so subscriber counts and delivery assertions are deterministic.

[[tests/test-config.ts#TEST_CONFIG]] is a minimal valid configuration for tests that need config-dependent code without writing settings. `GHE_CONFIG` exercises the dynamic enterprise-host wiring.

## Test layers

Most tests are fast unit tests over pure functions: priority derivation, label vocabulary, conflict resolution, pagination cursors, search parsing, time arithmetic, capacity distribution, attention rules, notification planning, and metadata parsing.

Database tests use the migrated in-memory schema and assert against mirror and state tables directly. Helpers such as `tests/mirror-helpers.ts` and `tests/planning-helpers.ts` build realistic rows without a network.

Route tests invoke SvelteKit handlers with constructed events and `locals`. They cover session and role enforcement, JSON error shapes, intake actions, issue writes, planning, notifications, and SSE. `tests/log-capture.ts` captures structured logs for assertions without noisy output.

Contract tests protect surfaces that are easy to let drift:

- `tests/openapi.test.ts` compares the intake schema with `static/openapi.yml`.
- `tests/docs-diataxis.test.ts` and the documentation tests keep the docs set consistent.
- `tests/a11y-contrast.test.ts`, `tests/composition-a.test.ts`, and screenshot tests guard the design and accessibility standards.
- `tests/release.test.ts`, `tests/systemd-packaging.test.ts`, and the standalone smoke script cover packaging and boot behaviour.

## Concept map

The main concepts map to these test files; they are the first place to look when changing the corresponding behavior.

| Concept | Representative tests |
| :--- | :--- |
| Process, routes, and guards | [[tests/routes.test.ts]], [[src/standalone.test.ts]] |
| RBAC, auth, first admin | [[tests/rbac.test.ts]], [[src/lib/server/auth/auth.test.ts]] |
| Polling and reconciliation | [[src/lib/server/sync/worker.test.ts]], [[src/lib/server/sync/reconcile.test.ts]] |
| Hydration and mirror writes | [[src/lib/server/sync/hydrate.test.ts]], [[src/lib/server/sync/mirror.test.ts]] |
| Label conflicts | [[src/lib/server/sync/conflicts.test.ts]] |
| Issue reads and writes | [[src/lib/server/issues/queries.test.ts]], [[src/lib/server/issues/mutations.test.ts]], [[tests/issues-routes.test.ts]] |
| Intake lifecycle | [[src/lib/server/intake/actions.test.ts]], [[src/lib/server/intake/staging.test.ts]], [[tests/intake.test.ts]], [[tests/inbox-triage-route.test.ts]] |
| Planning and actuals | [[src/lib/server/planning/capacity.test.ts]], [[src/lib/server/planning/plans.test.ts]], [[src/lib/server/planning/mutations.test.ts]], [[src/lib/server/actuals/time.test.ts]], [[src/lib/server/actuals/transitions.test.ts]] |
| Attention and notifications | [[src/lib/server/attention/rules.test.ts]], [[src/lib/server/notifications/plan.test.ts]], [[tests/attention-rules-page.test.ts]], [[tests/notifications-routes.test.ts]] |
| Client feeds and navigation | [[src/lib/client/feed-merge.test.ts]], [[tests/saved-views.test.ts]], [[tests/command-palette.test.ts]], [[tests/navigation-shell.test.ts]] |
| Contracts and design | [[tests/openapi.test.ts]], [[tests/docs-diataxis.test.ts]], [[tests/a11y-contrast.test.ts]], [[tests/composition-a.test.ts]] |
| Packaging and settings | [[tests/release.test.ts]], [[tests/systemd-packaging.test.ts]], [[tests/demo-wiring.test.ts]], [[tests/settings-sync.test.ts]] |

## Coverage gate

[[scripts/check-coverage.ts#CORE_DIRECTORIES]] deliberately scopes the floor to the core server directories: `issues`, `intake`, `sync`, and `github`. UI, routes, generated code, the standalone bootstrap, and the tests themselves are excluded.

The gate aggregates line and function coverage from `coverage/lcov.info` and fails below 95% in either dimension. The narrow scope keeps the signal meaningful: the core domain and sync logic must be well covered, while presentational code is reviewed by other tests and by inspection.

## Related

The architecture, sync, and workflow docs describe the systems these tests protect.

- [[architecture]] — the modules the tests exercise.
- [[sync]] — the behaviour the sync tests pin down.
- [[workflow]] — the label and priority rules covered by unit tests.
- [[operations]] — the release gate that runs this suite.
