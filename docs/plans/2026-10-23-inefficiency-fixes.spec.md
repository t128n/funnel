# Inefficiency fixes

## 1. Refresh behavior

Make SSE a single per-tab connection, coalesce bursts into one refresh, scope
issue refreshes to the changed issue, and stop the Inspector from discarding an
in-progress edit on an unrelated event.

## 2. Sync cadence

Stop fetching repo metadata and directory lists on every 30-second poll. Use the
first cycle and the nightly reconciliation for directory refresh, and skip
unchanged writes.

## 3. Sync write batching

Batch user upserts, issue writes, and comments, build the post-write snapshot
from the hydrated record, and resolve notification recipients in batches.

## 4. Query caches and counts

Cache filter options by mirror revision, use distinct queries, count staged
submissions in SQL, and count unread notifications with `count(*)`. Cache issue
page totals across cursor pages.

## 5. Schema and indexes

Add a persisted priority rank and matching index, a blocked/state index, and a
case-insensitive login index. Use them from the hot queries.

## 6. Issue detail payload

Cache rendered Markdown, page comments with a load-earlier path, query a
milestone by primary key, and cap milestone issue lists.

## 7. Client list and board

Avoid full-window copies and projections when there are no overlays, merge
unchanged first pages in place, and reduce board projection churn.
