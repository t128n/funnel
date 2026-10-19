# Derived priority from impact × urgency

**Goal:** retire the hand-set `p1`/`p2`/`p3` labels and make priority a derived P0–P3 value over the durable impact/urgency state, then use it for filtering, sorting, grouping and the Inspector.

**Ruling:** GitHub stays internal-only (priority is not published as a label). Per-instance matrix editing is deferred; the canonical matrix remains the single source of truth. Both follow the recommendations in #47 and keep the diff focused.

**Ruling:** A retired p-label is flagged via `labelConflict` only when it disagrees with the durable value. Matching legacy labels are silent, so the migration does not paint every existing issue with a warning; once a row exists the label is never trusted or written.

**Ruling:** The OpenCode harness has no superlite plugin agents and the SL scripts target a different plugin workspace; the build runs inline in this session with a fresh final-review subagent, recorded here instead of a dispatched task graph.

## Architecture

- `state_issue_priority` is Funnel-owned durable state keyed by `(org, name, issue_number)`. It stores `impact`, `urgency`, `priority` and timestamps. Mirror pruning/re-sync cannot delete it.
- `src/lib/priority.ts` stays the single source of truth for the matrix. Add display metadata (`PRIORITY_META`), legacy-label mapping, and `derivePriorityOrNull` (both axes unset → `null`, one axis unset → matrix fallback `P3`).
- The mirror no longer projects priority from labels. `deriveMetadata` ignores the retired labels; a legacy `p1`–`p3` on GitHub is only used to seed a missing state row (migration/first sight) and otherwise flags `labelConflict` when it disagrees with the derived value.
- The Inspector writes axes through a local `PATCH /api/mirror/issues/:owner/:repo/:number/priority` endpoint; the server derives and returns the row. Reads join the state table, so filters/sorts/grouping use the derived value everywhere.
- No code path writes `p1`–`p3` to GitHub. The labels are removed from the canonical provisioning list and filtered from cockpit label UI.

## Data flow

```
Inspector impact/urgency ──PATCH local──> state_issue_priority ──join──> queries ──> rows (P0-P3)
GitHub sync (labels/body) ──seed if no row──┘                 └──> priority filter / sort / group
```

## Tasks

1. Priority domain: metadata, legacy mapping, `derivePriorityOrNull`, unit tests.
2. Durable state: schema + migration (seed from mirrored p-labels), store module, seeding/first-sight + conflict flag tests.
3. Sync: stop projecting labels, seed state, flag retired labels; pruning/re-sync test.
4. Read path: join state in queries, P0–P3 filter vocabulary, derived sort, DTO fields.
5. Write path: local priority endpoint, client mutation, optimistic overlay.
6. UI: Inspector impact/urgency pickers + derived token; P0 “Urgent” token; board/row glyphs; filter/group labels; remove p-label writers (board/attention trays, intake, API).
7. Docs: priority/reserved labels/schema/API/workflow/glossary.
8. Verification: full suite, svelte-check, final review.

## Acceptance mapping

| Requirement | Where |
| --- | --- |
| Inspector derives/displays P0–P3 | InspectorPane + priority store |
| Axis change re-derives | local endpoint + optimistic `derivePriorityOrNull` |
| Filter/sort/group on derived | queries join, filters, grouping |
| P0 Urgent token / empty state | `PRIORITY_META`, PriorityIcon/Badge |
| No p-label writes | labels vocabulary, mutations, intake, UI |
| Existing issues keep priority | migration seed + first-sight seed |
| External p-labels flagged | sync conflict flag |
| Matrix single source / all cells | existing `priority.ts` tests + new tests |
| Prune/re-sync | state table keyed by slug/number + test |
