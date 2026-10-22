# Forge transport, slice 4 — sync poll, hydration and conflicts

## 1. Polling

`sync/worker.ts` polls with `provider.threads.list(repoRef, { kind: "issue", state: "all", since, sort: "updated", direction: "asc", perPage: 100, cursor: etag ? { etag } : undefined })`. The first page is read with `.page()`; `page.notModified` replaces the thrown 304, `page.etag` replaces the header read, and the remaining pages are read with `page.cursor`. A `Thread` replaces the raw `RestIssue`: `ref.number` is the issue number, `ref.externalId` is the GraphQL node id, `closedAt` drives the history window.

`ensureRepoMirror` reads `provider.repos.get(repoRef)` and stores `ref.externalId`, `owner`, `name` and `isArchived`. `refreshIssue` reads `provider.threads.get(threadRef(repo, "issue", number))` and hydrates `ref.externalId`.

## 2. Hydration

`hydrateAndStore` takes a `GitHubProvider` and calls `provider.graphql(HYDRATE_QUERY, { ids })` through a bound function. `hydrateNodes` keeps its injected `GraphqlFn` for tests. The GraphQL query and `normalizeNode` do not change.

## 3. Conflicts

`fetchTimeline(provider, ref)` walks `provider.threads.events(ref)` and keeps `kind === "label"` events with `detail.type === "label"`, using `detail.label` and `occurredAt`. `resolveIssueConflict` takes a provider and removes obsolete labels with `provider.threads.removeLabels(ref, [name])`. `resolveWinners` and `deriveMetadata` do not change.

## 4. Coexistence

The raw API passthrough, the users route and `app.server.ts` remain on Octokit. No schema, DTO, route or settings change. The full suite stays green.
