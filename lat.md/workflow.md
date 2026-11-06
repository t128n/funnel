# Workflow model

Funnel keeps workflow state on GitHub as a small reserved label vocabulary and caches it locally. Priority, actual time, plans, and local triage state are Funnel-owned.

## Labels carry the workflow

An issue's stage, impact, urgency, size, and blocked flag are ordinary GitHub labels.

GitHub is authoritative for all of them. The mirror columns (`status`, `impact`, `urgency`, `priority`, `size`, `blocked`, `is_epic`) are a cache recomputed on hydration, not a second source of truth.

The inversion is deliberate: the workflow stays visible and editable outside Funnel, and Funnel must tolerate label edits made by people, scripts, or other bots. The vocabulary lives in the dependency-free [[src/lib/labels.ts]] so the cockpit and the server share one definition.

## Reserved vocabulary and prefixes

[[src/lib/labels.ts#CANONICAL_LABELS]] fixes fifteen labels in six groups:

- **status** — `backlog`, `todo`, `in-progress`, `in-review`
- **impact** — `sev`, `mod`, `min`
- **urgency** — `high`, `mid`, `low`
- **size** — `sm`, `md`, `lg`
- **flags** — `blocked`
- **epic** — `epic`

Status, size, and the priority inputs are meant to hold one label per group. `blocked` and `epic` are orthogonal markers: an issue keeps its stage and carries either alongside it.

A configured `labels.prefix` changes only the actual GitHub name (`funnel-todo`), never the logical key (`todo`). [[src/lib/labels.ts#buildVocabulary]] builds both lookup tables, and [[src/lib/server/label-vocabulary.ts#vocabularyFor]] resolves the instance's vocabulary for server code.

[[src/lib/server/github/labels.ts#provisionCanonicalLabels]] creates missing reserved labels and patches drifted colors and descriptions at startup and during reconciliation. It touches only reserved names; every other repository label is preserved.

## Absence is a value

The vocabulary is smaller than it looks because a missing label carries meaning:

- no status label means **untriaged** and belongs in the Inbox;
- no impact or urgency means **not assessed**;
- no size label means **unestimated** and cannot be scheduled;
- no `blocked` label means **not blocked**.

[[src/lib/labels.ts#isUntriaged]] defines Inbox membership as `state === "open" && status === null`, and [[src/lib/server/issues/queries.ts#inbox]] mirrors it in SQL. The client uses the first to project the queue optimistically; the two definitions must stay in step.

## Derived priority

Priority is never a GitHub label. It is derived from impact × urgency through [[src/lib/priority.ts#DEFAULT_PRIORITY_MATRIX]]:

| impact \ urgency | high (1) | mid (2) | low (3) |
| :--- | :--- | :--- | :--- |
| sev (1) | P1 | P1 | P2 |
| mod (2) | P1 | P2 | P3 |
| min (3) | P2 | P3 | P3 |

[[src/lib/priority.ts#derivePriorityOrNull]] returns `null` when neither axis is assessed and the `P3` fallback when exactly one is. The mirror stores the derived value plus a sortable `priority_rank`; [[src/lib/priority.ts#PRIORITY_SCALE]] carries the display names and colors.

The retired `p1`–`p3` labels are still recognized so a disagreement can raise a conflict flag, but Funnel never provisions or writes them. New writes strip them.

## The views partition the work

The main views are queries over the same mirror:

- **Inbox** — pending intake submissions followed by untriaged open issues. [[src/lib/server/issues/queries.ts#inbox]] returns submissions first because they carry no repository, status, or assignee metadata.
- **Issues** — every triaged issue, open and closed. [[src/lib/server/issues/queries.ts#allIssues]] requires `status IS NOT NULL`, so an issue leaves the Inbox the moment it gains a status.
- **Board** — four open status columns plus a bounded Done column. [[src/lib/server/issues/queries.ts#statusBoard]] keeps blocking as a card flag, not a lane.
- **Matrix** — a 3×3 impact × urgency projection. [[src/lib/server/issues/queries.ts#matrixBoard]] renders the nine assessed cells, counts incomplete pairs in `needsAssessment`, and offers them in an assessment queue instead of inventing a cell.
- **Attention** — blocked work, waiting work, and rule breaches; see [[attention]].

Done is a window, not a storage location. It contains issues closed as `completed` within `board.done_days` (14 by default). Issues closed as `not_planned` are omitted, and a completed card ages out after the window even though the issue remains in **Issues**.

## Filters, search, and pagination

[[src/lib/server/issues/filters.ts#parseIssueFilter]] turns the shared URL model into the filter shape defined in [[src/lib/server/issues/filters.ts]]. Values OR within a dimension and AND across dimensions. Dimensions include repository, state, status, assignee, priority, size, type, labels, plan state, milestone, blocked, and waiting.

`q` accepts free text plus issue identifiers (`#123`, `FIT-123`, `owner/repo#123`) and GitHub-style qualifiers (`is:`, `label:`, `repo:`, `status:`, `assignee:`). [[src/lib/server/issues/search.ts#parseSearchQuery]] resolves identifiers and qualifiers; [[src/lib/server/issues/search.ts#ftsMatchExpression]] quotes every free-text term before it reaches FTS5, so user input is never executed as an FTS operator.

Feeds use keyset pagination, not offsets. [[src/lib/server/issues/pagination.ts#filterSignature]] signs the filter so a cursor from a different query is rejected, and [[src/lib/server/issues/pagination.ts#decodeCursor]] treats a stale cursor as the first page rather than an error. Totals always come from the server, so a board lane's WIP count does not depend on how many cards the client loaded.

## Writes are group-aware

Issue writes run with the user's token and keep at most one label per reserved group.

For a reserved group, the mutation reads the issue's authoritative label set from GitHub, swaps the sibling, and writes the set back in one call. [[src/lib/server/issues/mutations.ts#normalizeReserved]] and [[src/lib/server/issues/mutations.ts#withReserved]] implement that rule; [[src/lib/server/issues/mutations.ts#updateIssue]] applies it to status, impact, urgency, size, blocked, and milestone changes.

Creating an issue uses [[src/lib/server/issues/mutations.ts#createIssue]], which applies the same normalization, optionally sets a GitHub issue type in a follow-up write, and returns the new identity. Comment, reaction, label, and milestone writes follow the same pessimistic pattern: GitHub confirms first, then local state is refreshed.

## Comments, relations, and milestones

The Inspector reads a single issue through [[src/lib/server/issues/queries.ts#getIssueDetail]], which joins comments, timeline history, labels, assignees, plan state, and time data. Writes are separate endpoints so a comment edit cannot accidentally rewrite issue metadata.

GitHub-native parent/sub-issue and blocked-by/blocking links are read-only and mirrored separately from the manual `blocked` flag. Linked pull requests show review and check context without becoming issues. Milestones are ordinary GitHub milestones scoped to one repository: they appear as a view, a filter, a group-by dimension, and an Inspector property, and the picker may lazily create one in that repository.

## Work notes and attachments

Two durable concepts deliberately do not map to GitHub labels: internal work notes and the attachment dropbox.

A work note is an internal journal entry in `state_work_note`. It is never posted upstream unless explicitly published, and publishing deletes the note and turns it into a GitHub comment ([[src/lib/server/work-notes.ts]]). An attachment stores metadata in `state_attachment` and bytes under `FUNNEL_UPLOAD_DIR`, with a server-generated path and the original filename kept only for display ([[src/lib/server/attachments/store.ts]]).

Both are keyed by `owner/name` plus issue number rather than a foreign key to the disposable mirror, so they survive pruning and a re-sync. Both also snapshot author identity so they still render after the mirror's user table is rebuilt.

## Tests

Group-aware writes and feed queries are covered by [[src/lib/server/issues/mutations.test.ts]] and [[src/lib/server/issues/queries.test.ts]]; label and priority rules by [[src/lib/labels.test.ts]] and [[src/lib/priority.test.ts]].

## Related

The sync, intake, planning, and UI docs cover how this workflow state is populated and presented.

- [[sync]] — how labels and relationships reach the mirror.
- [[intake]] — how untriaged work enters the Inbox.
- [[planning]] — how sized issues become weekly commitments.
- [[ui]] — how the views and filters are driven from the browser.
