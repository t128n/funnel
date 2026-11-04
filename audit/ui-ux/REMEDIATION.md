# Funnel UI/UX remediation — coordination ledger

**Audit evidence baseline:** `3d229791dadf073eab2c22302d1d59b3c421c81c` on
`audit/ui-ux-2026-11-04` (read-only evidence; not the implementation base).

**Implementation baseline:** `origin/main` at `d60be30`
(“feat(planning): simplify weekly plan and remove daily planner (#106)”).
Every workstream re-reproduced its findings against this baseline before
changing code.

**Design authority:** [`docs/design/COMPOSITION-A.md`](../../docs/design/COMPOSITION-A.md)
— conventional Bootstrap 5.3 + Sveltestrap + Bootstrap Icons, compact tables and
forms, recognizable links, restrained spacing/colours, minimal custom CSS.

**Current state:** implementation delivered. Fifteen implementation PRs are
merged into `main`; five remain open (#147, #151, #153, #154, #156) plus the
ledger PR (#161). The combined branch passes `bun run check`, `bun run test` (1,408 pass / 0 fail), `bun run build`, and
cross-route browser verification, including the 10 previously deferred observations. GitHub issues/PRs remain authoritative.

## Status legend

- **Open — ready for review** — PR exists, coordinator review and integration
  validation passed.
- **Open — corrected** — PR was reviewed, a gap was found, and the owning agent
  pushed a correction.
- **Obsolete** — finding no longer has a surface on the implementation baseline.
- **Cross-referenced** — overlap noted; the linked feature remains open.

## Implementation workstreams

| WS | Issues | Branch(es) | PR(s) | Status |
| --- | --- | --- | --- | --- |
| Board | #108 #109 #100 | `fix/ux-board-layout`, `fix/ux-board-state` | #143, #147 | Delivered |
| Inbox | #111 #132 | `fix/ux-inbox-triage` | #146 | Delivered |
| Issues | #110 #139 #16 #131 #114 (page), #115 (label) | `fix/ux-issues-table`, `fix/ux-issues-filters` | #141, #144 | Delivered |
| Accessibility | #117 #116 #129 | `fix/ux-a11y-dialogs`, `fix/ux-a11y-contrast` | #142, #145 | Delivered |
| Navigation | #99 #112 #113 #134 #114 (nav) | `fix/ux-navigation-shell` | #151 | Delivered |
| Settings | #118 #119 #135 | `fix/ux-settings-feedback` | #152 | Delivered |
| Organization | #120 #123 #124 #121 #122 #115 | `fix/ux-org-tables`, `fix/ux-notifications-status`, `fix/ux-breadcrumbs` | #149, #153, #154 | Delivered |
| Issue detail | #133 #137 #140 | `fix/ux-issue-detail-state`, `fix/ux-issue-detail-mobile` | #148, #150 | Delivered |
| Plan | #125 | `fix/ux-plan-unsized` | #156 | Delivered |
| Timeline/Matrix | #127 #128 | `fix/ux-timeline-labels`, `fix/ux-matrix-mobile` | #155, #157 | Delivered |
| Errors/Intake | #130 #138 | `fix/ux-errors`, `fix/ux-intake-form` | #159, #160 | Delivered |
| Brand | #15 | `fix/ux-brand-assets` | #158 | Delivered |

Subagents: **12**. Implementation PRs: **20**. Docs/ledger PR: [#161](https://github.com/t128n/funnel/pull/161).

## Issue ledger

| Issue | Priority | Route / component | Problem (short) | PR | Status |
| --- | --- | --- | --- | --- | --- |
| #108 | P1 | `/board`, card menu | menu clipped by lane scroller/virtualized stacking context | [#143](https://github.com/t128n/funnel/pull/143) | Merged (#143) |
| #109 | P1 | `/board`, lane feeds | moved card stayed rendered in source lane until reload | [#147](https://github.com/t128n/funnel/pull/147) | Open — ready for review (#147) |
| #110 | P1 | `/issues`, `IssueTable` | Title collapsed to ~102px at 768 | [#141](https://github.com/t128n/funnel/pull/141) | Merged (#141) |
| #111 | P1 | `/inbox` triage | accept/decline ended on a 404 with a stale queue | [#146](https://github.com/t128n/funnel/pull/146) | Merged (#146) |
| #112 | P2 | navbar Search / Mod+K | page-local focus helper, no global surface, ID promise | [#151](https://github.com/t128n/funnel/pull/151) | Open — ready for review (#151) |
| #113 | P2 | mobile navbar collapse | menu stayed open after several navigation paths | [#151](https://github.com/t128n/funnel/pull/151) | Open — ready for review (#151) |
| #114 | P2 | overflow nav + `/issues?assignee=me` | no visible current state; generic My Issues identity | [#151](https://github.com/t128n/funnel/pull/151) + [#144](https://github.com/t128n/funnel/pull/144) | Merged #144 (page); #151 open (nav) |
| #115 | P2 | organization/issue/inbox breadcrumbs | missing/unlabelled breadcrumb landmarks; epic dead end | [#154](https://github.com/t128n/funnel/pull/154) + [#144](https://github.com/t128n/funnel/pull/144) | Merged #144 (Issues label); #154 open (all pages) |
| #116 | P2 | skip link | painted underneath the navbar | [#145](https://github.com/t128n/funnel/pull/145) | Merged (#145) |
| #117 | P2 | all dialogs | no focus move/trap/restore, no `aria-modal`/name | [#142](https://github.com/t128n/funnel/pull/142) | Merged (#142) |
| #118 | P2 | `/settings/*` | unsaved edits discarded without warning | [#152](https://github.com/t128n/funnel/pull/152) | Merged (#152) |
| #119 | P2 | settings validation | off-screen, duplicated, leaked internal keys, no field link | [#152](https://github.com/t128n/funnel/pull/152) | Merged (#152) |
| #120 | P2 | epics/milestones tables | desktop columns overflowed at tablet/mobile | [#149](https://github.com/t128n/funnel/pull/149) | Merged (#149) |
| #121 | P2 | `/notifications` | mobile titles truncated; rows past 100 unreachable | [#153](https://github.com/t128n/funnel/pull/153) | Open — ready for review (#153) |
| #122 | P2 | `StatusText` / blocked / epic detail | status, blocked and missing status conflated | [#153](https://github.com/t128n/funnel/pull/153) | Open — ready for review (#153) |
| #123 | P2 | `/epics` | epic title was not a link | [#149](https://github.com/t128n/funnel/pull/149) | Merged (#149) |
| #124 | P2 | `/milestones` | overdue and future milestones looked identical | [#149](https://github.com/t128n/funnel/pull/149) | Merged (#149) |
| #125 | P2 | `/plan` | planned null-size issues vanished; “nothing planned” | [#156](https://github.com/t128n/funnel/pull/156) | Open — ready for review (#156) |
| #126 | P2 | `/day` | horizontal overflow at 390 | — | **Obsolete** — `/day` removed by #106; issue closed |
| #127 | P2 | `/timeline` labels | fixed 44px rows clipped/overlapped labels | [#155](https://github.com/t128n/funnel/pull/155) | Merged (#155) |
| #128 | P2 | `/matrix` mobile | selection produced no visible result; Low column hidden | [#157](https://github.com/t128n/funnel/pull/157) | Merged (#157) |
| #129 | P2 | dark controls / composer `kbd` | contrast 3.29–3.41:1; hint ~1:1 | [#145](https://github.com/t128n/funnel/pull/145) | Merged (#145) |
| #130 | P2 | error + missing entity pages | shell lost, internal copy, dead Try Again/GitHub | [#159](https://github.com/t128n/funnel/pull/159) | Merged (#159) |
| #131 | P2 | `/issues` `/board` `/matrix` filters | split toolbar/offcanvas; State hidden; badge/Clear disagree | [#144](https://github.com/t128n/funnel/pull/144) | Merged (#144) |
| #132 | P2 | `/inbox?q=` | no-match search showed “Inbox is clear” | [#146](https://github.com/t128n/funnel/pull/146) | Merged (#146) |
| #133 | P2 | issue Status select | cancelling close/reopen left select out of sync | [#148](https://github.com/t128n/funnel/pull/148) | Merged (#148) |
| #134 | P3 | navbar dropdowns | no Escape/arrow keys; visual-only selection | [#151](https://github.com/t128n/funnel/pull/151) | Open — ready for review (#151) |
| #135 | P3 | `/settings/appearance` | no radio reflected the current theme | [#152](https://github.com/t128n/funnel/pull/152) | Merged (#152) |
| #136 | P3 | `/day` candidates | planned candidates stayed addable; impossible Retry | — | **Obsolete** — `/day` removed by #106; issue closed |
| #137 | P3 | issue title editor | blur committed silently; no Save/Cancel | [#148](https://github.com/t128n/funnel/pull/148) | Merged (#148) |
| #138 | P3 | `/intake` | required title unmarked; success lacked reference | [#160](https://github.com/t128n/funnel/pull/160) | Merged (#160) |
| #139 | P2 | `/issues` rows | every row was a second, empty tab stop | [#141](https://github.com/t128n/funnel/pull/141) | Merged (#141) |
| #140 | P2 | issue detail < `lg` | Properties buried after the whole thread | [#150](https://github.com/t128n/funnel/pull/150) | Merged (#150) |

### Pre-existing issue overlap

| Issue | PR | Status | Note |
| --- | --- | --- | --- |
| #99 | [#151](https://github.com/t128n/funnel/pull/151) | Open — ready for review (#151) | repo scope removed; `?repo=` + Filters preserved |
| #100 | [#143](https://github.com/t128n/funnel/pull/143) | Merged (#143) | board fits viewport; lanes scroll internally |
| #16 | [#144](https://github.com/t128n/funnel/pull/144) | Merged (#144) | container-responsive search at 1440/768 |
| #15 | [#158](https://github.com/t128n/funnel/pull/158) | Merged (#158) | icons/manifest/error page → `#0060df` |
| #19 | — | Cross-referenced | #111/#146 fixes its 404/stale-queue base; full triage feature remains open |
| #21 | — | Cross-referenced | #112/#151 stops the ID promise; FTS5/identifiers/qualifiers remain open |

## Dependencies and conflicts resolved during integration

- **Feed state** — #146 (`remove`) and #147 (`retain`/authoritative merge) both
  edited `feed.svelte.ts`/`feed-merge.ts`; the combined branch keeps both APIs and
  all feed tests pass.
- **Epic status** — #149 (responsive columns) and #153 (real status) both edited
  `EpicList.svelte`; the combined row keeps the responsive classes and renders
  `epic.status`.
- **Inbox** — #146 (queue state), #151 (search placeholder) and #154 (breadcrumb)
  all touch the Inbox page; the combined page keeps all three.
- **Issue detail** — #148 (status/title), #150 (mobile order), #159 (error
  branch) and #154 (breadcrumb label) were merged; the error branch and normal
  branch remain separate.
- **App CSS** — #143, #145 and #155 add distinct blocks/tokens; no semantic
  conflict.
- **`AppBar.svelte`** — only #151 changed it; #144's My Issues page identity is
  independent.
- **Post-review corrections** — #142 was updated to restore focus to a
  re-rendered select trigger (verified `#issue-status`); #157 was updated so
  selecting the already-selected/default cell still reveals and focuses the
  detail (verified `scrollY` 614, heading top 336 at 390×844).
- **Post-merge rebases** — after the first 15 PRs landed, #147, #151, #153,
  #154 and #156 were rebased onto the new `main`. #151/#153/#154 are stacked on
  #147 because it adds the shared `Feed.retain` contract; #147 must merge first.
  All six remaining PRs now report `MERGEABLE / CLEAN`; a fresh simulation of
  the recommended merge order passes check, the full suite (1,408 tests) and
  build.

## Cross-PR verification (isolated integration branch)

- Merged all 20 implementation PRs in dependency-aware order; resolved only the
  conflicts listed above.
- `bun run check` — 0 errors, 0 warnings.
- `bun run test` — **1,408 pass / 0 fail** across 149 files.
- `bun run build` — passed.
- Browser checks: `/issues` 768 title 446px + one tab stop; My Issues identity
  and labelled breadcrumb; Inbox accept stays on `/inbox` and no-match state;
  board fills 900px viewport, last-card menu 9/9 hit-testable, drag leaves one
  copy; settings theme radio; skip link topmost; epics 390 no overflow; timeline
  no clipped rows; matrix selection reveals/focuses detail; plan shows unsized
  commitments; issue detail Properties at 347px on mobile and status cancels
  restore; global search works from `/settings`; mobile menu closes; intake
  success shows a reference; 404 keeps the shell without a dead Try Again;
  brand manifest/icon use `#0060df`.
- Deferred polish checks: labelled issue rows stay 41px at 1440; PriorityText
  announces “P1, high priority” once; re-check/delays use `9 Nov 2026` /
  `2 Nov 2026, 07:07`; Attention says “Re-check overdue/today/upcoming” and its
  description names re-check dates; settings WIP labels match the Board and
  Projects/People have distinct section headings; dark navbar has a 1px border
  while light is unchanged; search shows exactly one clear control; milestone
  detail uses the shared IssueTable with no repeated milestone name and an
  “Add issues” picker; Epic Add child is `btn-primary btn-sm` with task-oriented
  copy.

## Recommended merge order

1. #141 issues table; #146 inbox; #143 board layout; #147 board state.
2. #142 dialogs; #145 skip link/contrast.
3. #148 detail state; #150 detail mobile.
4. #152 settings feedback.
5. #149 org tables; #153 notifications/status; #154 breadcrumbs.
6. #156 plan unsized; #155 timeline; #157 matrix.
7. #144 issues filters/My Issues; #151 navigation shell.
8. #159 errors; #160 intake; #158 brand.

The order minimizes shared-file conflicts. Independent PRs may merge in any order
once reviewed; the integration branch shows the full set is compatible.

## Deferred / rejected audit findings

The audit recorded 12 deferred/rejected observations. They are intentionally
**not** part of this campaign:

- **Rejected (do not revive):** `/plan` Week/Cycle/Milestones/Day switcher and a
  “Schedule issue” action on `/plan`. Both contradict the shipped product
  decision in `ba958ac` (#101): planning is an issue property and scheduling
  lives in the issue Properties panel.
- **Deferred observations — now delivered:** all 10 lower-value observations
  were implemented as extensions to their owning PRs after the confirmed
  backlog:
  1. Priority announced once as “P1, high priority” — #144.
  2. Issue-detail date formats unified (`2 Nov 2026`, delay start/end, precise
     tooltips) — #148.
  3. Milestone detail now uses the shared `IssueTable` and does not repeat the
     milestone name — #149.
  4. Attention uses re-check language and a visible description — #154.
  5. Settings WIP labels match the Board; Projects/People headings are distinct
     — #152.
  6. Dark navbar has a token-derived boundary; light is unchanged — #151.
  7. Search fields show one labelled clear control — #151.
  8. Index label badges stay on the title line (41px rows), with `+N` overflow
     — #141.
  9. Epic Add child uses compact primary styling and task-oriented copy — #149.
  10. Milestone detail has an “Add issues” picker and documents removal via the
      issue’s Milestone property — #149.
  No rejected finding was revived.

## Campaign state

- Audited findings evaluated: **33** new (#108–#140) + **4** pre-existing
  (#99, #100, #16, #15); #19/#21 inspected and cross-referenced.
- Fixed and delivered: **31** new issues + **4** pre-existing + **10** deferred
  observations.
- Obsolete on the implementation baseline: **#126, #136** (closed with rationale
  after #106 removed `/day`).
- Partial / still open by design: **#19, #21** (features; only their UI-audit
  overlap was addressed).
- Implementation PRs: **20** — **15 merged**, **5 open** (#147, #151, #153,
  #154, #156). Ledger PR: [#161](https://github.com/t128n/funnel/pull/161).
- Merge state: **implementation delivered; 15 PRs merged, 5 open**. #147 must
  merge before #151/#153/#154 (they are stacked on its shared `Feed` contract).
