# Cockpit UI

The cockpit is a SvelteKit application with server-rendered first pages, client feed stores for pagination, optimistic overlays for writes, and one shared SSE stream. The URL is the source of truth for filters and sort.

## Routes and shells

Cockpit routes live under the `(app)` layout, which loads shared data for every view.

The views are Inbox, Issues, Board, Matrix, Attention, Milestones, Timeline, Plan, Epics, Notifications, Insights, and Settings. The board and matrix are index pages; `/board/{owner}/{repo}/{number}` and `/matrix/{owner}/{repo}/{number}` redirect to the dedicated issue document at `/issues/{owner}/{repo}/{number}`. The Inbox issue link redirects there too. Staged submissions keep their own review route at `/inbox/submission/{id}`.

The issue document validates its path and fetches the Inspector payload client-side from the local mirror. A syntactically valid but not-yet-mirrored issue is left to the Inspector's empty state.

The app shell in [[src/routes/(app)/+layout.svelte]] owns the shared SSE connection, label-prefix activation, quick-create dialog, global status, native-notification opt-in, and refresh signalling. Individual pages own their feeds and toolbars.

## URL state and filters

Filters, sort, direction, grouping, selection, and saved-view identity live in the URL. [[src/lib/url-filter.ts]] parses and serialises the client filter model; [[src/lib/url-filter.ts#buildFilterUrl]] builds navigation targets without losing unrelated parameters.

The server parses the same URL with [[src/lib/server/issues/filters.ts#parseIssueFilter]]. Values OR within a dimension and AND across dimensions. Search lives in `q`, and the same filter survives reloads and shared links. Saved views store a validated query string plus sort, direction, and grouping; the URL remains the runtime source of truth.

## Feed stores

[[src/lib/client/feed.svelte.ts#createFeed]] owns one loaded window. The first page comes from a SvelteKit `load`; `loadMore` walks forward with the server's keyset cursor; `sync` merges an authoritative first page into the loaded window.

[[src/lib/client/feed-merge.ts#mergeFirstPage]] keeps the tail the user has already scrolled past while replacing the rows the server returned. An unchanged page reuses the loaded array, so an idle SSE refresh does not re-render every row. A changed filter view replaces the window instead of merging.

The board uses a lane-aware feed in [[src/lib/client/board-feed.svelte.ts#createBoardFeed]], so each lane paginates independently and its WIP count comes from the server total rather than the loaded cards.

## Optimistic overlay

A mutation applies its patch before the network request and projects it over the authoritative payload.

A failed write removes its overlay, which restores the original data exactly. A successful write publishes an immediate event and a second event after the background refresh, so overlays are removed by **value**, not by refresh count. [[src/lib/client/optimistic.svelte.ts#reconcileIssues]] keeps an overlay until the authoritative data actually satisfies it, preventing a stale refresh from bouncing the UI back.

Bulk actions use [[src/lib/client/bulk-runner.ts#runBulk]], a bounded runner over the existing single-item write paths. It keeps input order, isolates failures, and avoids a burst of hundreds of parallel GitHub writes.

## Realtime updates

[[src/lib/client/events.ts#connectEvents]] opens one `EventSource` per tab and shares it among all subscribers. The browser reconnects transient drops itself; the wrapper reopens a fatally closed stream after two seconds while subscribers remain.

Events are `sync`, `issues`, `intake`, `settings`, `notifications`, and `planning`. The issues event names a repository and the changed issue numbers. [[src/lib/client/refresh.ts#bumpRefresh]] carries that scope, so the Inspector can skip refetching unrelated issues while the loaded feeds still refresh.

## Keyboard and commands

[[src/lib/client/hotkeys.ts#appHotkeys]] declares the app-wide catalog without callbacks, so the shell, hint components, and tests share one source. Components attach behaviour with `createHotkey`, which reads the user's effective binding at registration time.

The catalog covers search (`Mod+K`, `/`), settings (`Mod+,`), new issue (`C`), status (`S`), select (`X`), list navigation (`J`/`K`), open (`Enter`), and dismiss (`Escape`). Board cards add lane and card navigation, and list views share the same keyboard model. Modals use focus traps and restore focus when they close.

## Rendering and safety

Issue bodies, comments, and intake submissions are untrusted, so rendering is server-side and sanitized.

The `funnel_metadata` envelope is an HTML comment, so the sanitizer hides it from the rendered article while the raw body retains it. Syntax highlighting is server-side; Mermaid diagrams are rendered on the client.

## Tests

Feed merging, saved views, command palette, shell navigation, and the design/accessibility contracts are covered by [[src/lib/client/feed-merge.test.ts]], [[tests/saved-views.test.ts]], [[tests/command-palette.test.ts]], [[tests/navigation-shell.test.ts]], [[tests/composition-a.test.ts]], and [[tests/a11y-contrast.test.ts]].

## Related

The workflow, sync, and security docs describe the data and guarantees the UI presents.

- [[workflow]] — the filter dimensions and views the UI exposes.
- [[sync]] — the events that drive refresh.
- [[operations]] — feature flags and demo mode.
- [[security]] — the role checks behind the controls.
