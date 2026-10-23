# Comment sync correctness — pagination and deletion reconciliation

## 1. Pagination

Hydration must mirror **every** comment on a hydrated issue, not only the first
100. The batched `nodes(ids:)` query keeps the first comment page so ordinary
issues still cost one GraphQL request per 100 issues:

- `HYDRATE_QUERY` requests `comments(first: 100)` with
  `pageInfo { hasNextPage endCursor }` alongside the comment nodes.
- When a node reports `pageInfo.hasNextPage === true`, hydration follows up with
  `node(id: $id)` and `comments(first: 100, after: $after)`, passing the previous
  `endCursor`, until `hasNextPage` is false.
- Pages are appended in order and de-duplicated by `externalId`; a comment that
  appears on two pages is stored once.
- The follow-up query is a separate exported constant (`COMMENTS_QUERY`) and is
  only issued for issues that need it.

Failure behaviour is fail-closed: if GitHub reports `hasNextPage` without an
`endCursor`, or pagination exceeds a bounded page count, hydration throws before
anything is stored. A partial comment list must never reach `upsertIssue`, because
`upsertIssue` now treats the supplied list as complete (section 2).

`normalizeNode` keeps its current contract: it normalizes the first page plus
`pageInfo`; the pagination loop lives in `hydrateNodes` so it stays testable with
an injected `GraphqlFn`.

## 2. Deletion reconciliation

`mirror.upsertIssue` treats `IssueRecord.comments` as the issue's complete
comment set. After upserting that set it removes mirrored rows for the same
`(repoId, threadNumber)` whose `externalId` is absent from the set:

- An empty incoming list clears every mirrored comment for that thread.
- Deletion is scoped to the thread: comments on other issues are untouched.
- Stale ids are removed with chunked `inArray` deletes so a thread with more than
  SQLite's bound-variable limit cannot fail the transaction.
- Edited comments keep their existing upsert path: body and `updatedAt` are
  overwritten, `createdAt` and identity are preserved.
- The delete runs in the same transaction as the comment upserts, so a failed
  write leaves the previous mirror state intact.

## 3. Compatibility

- No schema, route, DTO, or settings change.
- `hydrateAndStore`, `hydrateNodes`, `normalizeNode`, and `IssueRecord` keep their
  exported signatures.
- Existing sync callers need no change; the worker keeps passing node ids.
- Notifications read comments through `snapshotIssue`, so a deleted comment
  disappears from the next snapshot without a planner change.
- Focused verification: `bun test --preload ./tests/setup.ts --max-concurrency 1
  src/lib/server/sync/hydrate.test.ts src/lib/server/sync/mirror.test.ts`.
- The full suite stays green.
