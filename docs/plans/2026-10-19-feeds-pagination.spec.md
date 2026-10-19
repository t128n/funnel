# Spec — board scroll fix + feed pagination/virtualization

Source: GitHub issue #22 plus the reported `/board` scroll bug.

## 1. Problem

- `/board` lanes clip overflowing cards instead of scrolling: `StatusBoard.svelte`
  uses `overflow-y-hidden` and `BoardColumn.svelte` never height-constrains its
  `overflow-y-auto` list. Headers must stay fixed while cards scroll.
- Every feed loads its full result set: `allIssues()`, `inbox()`, and
  `statusBoard()` call `rawQuery()` without a limit; each row hydrates labels and
  assignees. DOM size grows with the mirror.

## 2. Required behaviour

1. A board lane taller than the viewport scrolls vertically; the column header,
   WIP count, and new-issue link stay fixed. Horizontal board scrolling and
   drag-and-drop between lanes still work.
2. Issues, Inbox, and Board fetch pages, not every row. Infinite scroll loads the
   next page automatically; no page-number clicks are required. A failed fetch
   may render an explicit retry.
3. Board pagination is per column, not one global limit. Column totals (including
   WIP counts) come from the server, not from loaded rows.
4. Page walking has no duplicates and no gaps. Filter changes reset pagination and
   scroll position.
5. SSE refreshes must not reset the user's scroll position. The authoritative
   first page is merged into the loaded window; optimistic overlays reconcile by
   value as today.
6. Long lists are virtualized so only the visible rows/cards are mounted. Issues
   and Inbox use `virtua/svelte`. The board also uses Virtua; `svelte-dnd-action`
   is replaced because it requires a one-to-one items ↔ DOM-children mapping.
7. Board keyboard navigation keeps working off the data model (arrow focus and a
   Space pick-up/move/drop mode), independent of which cards are mounted.
8. A large fixture (e.g. 5,000 issues) keeps DOM bounded and scrolling responsive.

## 3. Fixed decisions

- Cursor pagination, not offset. Order: priority rank ASC (`p1`→`p3`, none last),
  then `updatedAt` DESC, then `repoId` DESC, then `number` DESC.
- Cursors are base64url JSON carrying the sort tuple and a filter signature; a
  cursor from a different filter is rejected.
- Page size: 100 for Issues/Inbox, 50 per board lane.
- New read endpoints live under `/api/feeds/` and require RBAC `read`.
- Board DnD uses `@atlaskit/pragmatic-drag-and-drop` plus element auto-scroll.
- Loaded-window refresh is capped at 500 rows; beyond that only the first 500 are
  refreshed and the tail is retained.
- Grouping remains a client projection over the loaded window. Page appends may
  insert rows into earlier sections; Virtua anchoring must keep the viewport
  stable. Server-side grouping is out of scope.

## 4. Acceptance

- A lane with more cards than the viewport scrolls; all cards reachable; header fixed.
- Issues/Inbox/Board render bounded DOM and load more on scroll.
- No duplicate or missing rows while walking pages.
- Filtering/searching resets the cursor and returns to the first page.
- SSE updates preserve scroll position.
- Board drag within/across lanes, Done dialog flow, and keyboard moves work.
- `bun test` and `bun run check` pass.
