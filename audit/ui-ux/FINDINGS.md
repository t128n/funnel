# Funnel UI/UX Audit — Consolidated Findings

**Audited revision:** `3d229791dadf073eab2c22302d1d59b3c421c81c` (`chore: version packages (#103)`)
**Audit date:** 2026-11-04
**Design authority:** [`docs/design/COMPOSITION-A.md`](../../docs/design/COMPOSITION-A.md)
**Environment:** demo mode, disposable SQLite databases, `agent-browser` 0.41.2 / Chrome 157
**Evidence branch:** [`audit/ui-ux-2026-11-04`](https://github.com/t128n/funnel/tree/audit/ui-ux-2026-11-04/audit/ui-ux)
**Detailed workstream reports:** [`coverage/`](./coverage) and [`findings/`](./findings)

## Summary

| Metric | Value |
| --- | ---: |
| Workstreams (subagents) | 5 |
| Route entries covered | 38 |
| Interaction/state checks | ~210 |
| Screenshots captured | 226 |
| Raw findings | 67 |
| New GitHub issues | 33 |
| Existing issues confirmed/updated | 4 (#99, #100, #16, #15) |
| Existing issues cross-referenced | 2 (#21, #19) |
| Duplicate/overlapping findings consolidated | 11 |
| Findings rejected or deferred | 12 |

Priority distribution of the 33 new issues: **P1 × 4, P2 × 24, P3 × 5**.

The audit deliberately did not file every observation. Findings were rejected when they contradicted a shipped product decision, and low-value polish was deferred with the reason recorded below.

## P1 — broken or severely obstructed workflows

| Issue | Problem | Source |
| --- | --- | --- |
| [#108](https://github.com/t128n/funnel/issues/108) | Board card actions menu is clipped by the lane and unusable | C |
| [#109](https://github.com/t128n/funnel/issues/109) | Board moves leave a stale, interactive copy in the source lane | C |
| [#110](https://github.com/t128n/funnel/issues/110) | Issue index title collapses to ~102px at 768px | B |
| [#111](https://github.com/t128n/funnel/issues/111) | Inbox triage actions end on a 404 and leave a stale queue | B |

Why these are P1: the board's only per-card action surface is unusable; the board displays contradictory data after every move; the primary issue list cannot be scanned at a required viewport; and every Inbox accept/decline completes in the database but ends on an error page.

## P2 — significant usability issues and recurring inconsistencies

| Issue | Problem | Source |
| --- | --- | --- |
| [#112](https://github.com/t128n/funnel/issues/112) | Navbar Search is page-local and advertises unsupported ID lookup | A, B |
| [#113](https://github.com/t128n/funnel/issues/113) | Mobile menu stays open after repo/account/brand navigation | A |
| [#114](https://github.com/t128n/funnel/issues/114) | Overflow destinations have no visible current-page state; My Issues has no identity | A, D |
| [#115](https://github.com/t128n/funnel/issues/115) | Breadcrumbs are missing on organization pages and unlabelled everywhere | D, A |
| [#116](https://github.com/t128n/funnel/issues/116) | Skip link is painted underneath the navbar | A |
| [#117](https://github.com/t128n/funnel/issues/117) | Dialogs do not move or trap focus | C, E |
| [#118](https://github.com/t128n/funnel/issues/118) | Unsaved settings edits are discarded without warning | E |
| [#119](https://github.com/t128n/funnel/issues/119) | Settings validation is off-screen, duplicated, and leaks internal keys | E |
| [#120](https://github.com/t128n/funnel/issues/120) | Epics/milestones tables overflow on tablet and mobile | D |
| [#121](https://github.com/t128n/funnel/issues/121) | Notification titles truncate on mobile; items past 100 are unreachable | D |
| [#122](https://github.com/t128n/funnel/issues/122) | Status cells show "Blocked"/"Unconfirmed" instead of the real status | B, D |
| [#123](https://github.com/t128n/funnel/issues/123) | Epic titles are not links | D |
| [#124](https://github.com/t128n/funnel/issues/124) | Overdue milestones look identical to future ones | D |
| [#125](https://github.com/t128n/funnel/issues/125) | Planned issues without a size disappear while `/plan` says nothing is planned | C |
| [#126](https://github.com/t128n/funnel/issues/126) | `/day` overflows horizontally at 390px | C |
| [#127](https://github.com/t128n/funnel/issues/127) | Timeline labels are clipped and overlap at desktop/tablet | C |
| [#128](https://github.com/t128n/funnel/issues/128) | Matrix mobile cell selection gives no visible result | C |
| [#129](https://github.com/t128n/funnel/issues/129) | Text and control contrast fails in dark/light themes | E, B |
| [#130](https://github.com/t128n/funnel/issues/130) | Not-found pages lose the shell and offer dead recovery actions | A, B, D, E |
| [#131](https://github.com/t128n/funnel/issues/131) | Filtering is split across a toolbar and an offcanvas drawer | B, C |
| [#132](https://github.com/t128n/funnel/issues/132) | No-match Inbox search shows the success "Inbox is clear" state | B |
| [#133](https://github.com/t128n/funnel/issues/133) | Cancelling close/reopen leaves the status select out of sync | B |
| [#139](https://github.com/t128n/funnel/issues/139) | Every issue row is a second, empty tab stop | B |
| [#140](https://github.com/t128n/funnel/issues/140) | Mobile issue detail buries Properties after the whole thread | B |

## P3 — localized polish and minor friction

| Issue | Problem | Source |
| --- | --- | --- |
| [#134](https://github.com/t128n/funnel/issues/134) | Navbar dropdowns lack Escape/arrow keys and selected-state semantics | A |
| [#135](https://github.com/t128n/funnel/issues/135) | Appearance radio group shows no current theme | E |
| [#136](https://github.com/t128n/funnel/issues/136) | Planned day candidates remain addable; overlap errors offer an impossible Retry | C |
| [#137](https://github.com/t128n/funnel/issues/137) | Inline title editing commits on blur with no Save/Cancel | B |
| [#138](https://github.com/t128n/funnel/issues/138) | Intake required field and success reference are missing | E |

## Existing issues confirmed or updated

| Issue | Action | Finding |
| --- | --- | --- |
| [#99](https://github.com/t128n/funnel/issues/99) | Commented with evidence | Repo scope is transient, does not scope Inbox, relabels on Settings, and loses its label at 992–1199px. Removal still resolves all of it. |
| [#100](https://github.com/t128n/funnel/issues/100) | Commented with evidence | Reproduced at 1440/768: 60svh canvas leaves a dead band and clips the last In Progress card. Lane-internal scrolling from #14 is not regressed. |
| [#16](https://github.com/t128n/funnel/issues/16) | Commented with evidence | No longer reproduces at 1440; still reproduces at 992–1024. Acceptance range should be corrected. |
| [#15](https://github.com/t128n/funnel/issues/15) | Commented with evidence | `favicon.svg`/`site.webmanifest` still use `#3574f0`; `src/error.html` no longer does, narrowing the scope. |
| [#21](https://github.com/t128n/funnel/issues/21) | Cross-referenced | Current placeholder promises ID search that fails; covered as part of #112 until #21 lands. |
| [#19](https://github.com/t128n/funnel/issues/19) | Cross-referenced | #111 fixes the current 404/stale queue behavior that the triage work here builds on. |

## Systemic problems

1. **Mutation feedback and state reconciliation.** Results are written but the UI is not reconciled: Inbox accept/decline lands on a 404 (#111), board moves leave stale cards (#109), settings edits vanish (#118), status selects go stale after cancel (#133), day candidates stay addable (#136), and notification counts exceed the list (#121). This is the largest cluster.
2. **Responsive density and overflow.** The app is designed at 1440 and degrades at required tablet/mobile widths: issue title collapse (#110), organization tables (#120), day overflow (#126), timeline labels (#127), matrix selection (#128), notification titles (#121).
3. **Accessibility fundamentals.** Skip link invisible (#116), dialogs without focus management (#117), row double tab stops (#139), navbar keyboard/ARIA gaps (#134), and contrast failures (#129). These are shared-component problems, not isolated page defects.
4. **Navigation orientation and information architecture.** Global search does not exist as advertised (#112), mobile navigation stays open (#113), overflow destinations lose their current state (#114), breadcrumbs are inconsistent (#115), and filtering is split across two surfaces (#131).
5. **State honesty.** Empty, error and validation states frequently misrepresent reality: "Inbox is clear" while items wait (#132), "Nothing is planned" while an issue is committed (#125), error pages that offer impossible retries (#130), and settings errors that appear to do nothing (#119).
6. **Vocabulary drift.** The same facts are named differently across surfaces: status vs blocked vs "Unconfirmed" (#122), "In-Progress" vs "In Progress", and several date formats. The filed issues cover the user-facing contradictions; pure copy polish was deferred.

## Rejected findings

| Finding | Reason |
| --- | --- |
| `/plan` is missing the Week/Cycle/Milestones/Day switcher | Deliberate product change in `CHANGELOG.md` (`ba958ac`): `/plan` is a single-week capacity view; cycle and milestone horizons were removed. `MIGRATION-MAP.md` is stale here, not the UI. |
| `/plan` has no "Schedule issue" action | Same shipped decision: scheduling moved to the issue Properties panel, and the page states this. Adding a picker would reintroduce complexity the product intentionally removed. |
| Repository scope dropdown defects | Already tracked by #99; a second issue would compete with the removal decision. Evidence added as a comment instead. |
| Board canvas `60svh` | Already tracked by #100; verified and commented. |
| Feed search narrow at 1440 | Already tracked by #16; the audit corrected its reproduction range rather than duplicating it. |
| Favicon/manifest old blue | Already tracked by #15; scope narrowed in a comment. |

## Deferred (verified but not filed)

These are real but lower-value than the 33 filed issues. They should be picked up only after the P1/P2 backlog, or folded into nearby work:

- Priority text is announced as "High, High priority" and hides the P1–P3 token from assistive technology.
- Issue detail uses four date/time formats on one page.
- Milestone detail renders issues with the older `IssueList` rather than the shared table; the milestone name repeats in every row.
- Attention presents re-check dates as due dates ("Overdue", "Due today") and repeats "No date · No re-check date".
- Settings WIP labels read "In-Progress"/"In-Review"; Projects/People repeat the h1 as an h2.
- Dark navbar has no boundary against the dark page background.
- Search fields show both the native clear "X" and a custom clear button.
- Index label badges wrap onto a second line, inflating rows from 41px to 71–95px.
- Epic Add child uses secondary styling and implementation-first copy ("written to the epic issue body").
- Milestone detail has no add/remove membership entry point; membership is only editable from an issue.

## Recommended remediation order

1. **Stop the data/state contradictions (P1):** #111, #109, #108, #110.
2. **Fix shared accessibility plumbing:** #117, #116, #139, #129, #134.
3. **Make feedback and validation trustworthy:** #118, #119, #133, #136, #132.
4. **Repair responsive layouts:** #120, #126, #128, #127, #121.
5. **Restore conventional navigation and filtering:** #112, #113, #114, #115, #131.
6. **Clear remaining P2 consistency issues:** #122, #123, #124, #125, #130, #135, #137, #138, #140.
7. **P3 polish:** #134, #135, #136, #137, #138 (where not already covered).
8. **Revisit the deferred list** only after the above.

Several fixes share components (`StatusText`, `IssueTable`, `FilterPopover`, `SettingsForm`, the Sveltestrap modal wrapper, the dropdown wrapper, and the board virtualizer). Grouping work by component will resolve multiple issues at once.

## Evidence and reproducibility

- All screenshots were captured from the running app at 1440×900, 768×1024 and 390×844 in Light and Dark. They are published on the `audit/ui-ux-2026-11-04` branch and linked from each issue.
- The detailed evidence, reproduction steps and per-workstream coverage tables are in [`findings/`](./findings) and [`coverage/`](./coverage).
- The aggregate route/interaction matrix is in [`COVERAGE.md`](./COVERAGE.md).
- The audit brief and environment recipe are in [`AUDIT-BRIEF.md`](./AUDIT-BRIEF.md).
- The existing-issue snapshot is in [`existing-issues.md`](./existing-issues.md).

## Limitations

Demo mode is pre-authenticated as an admin, so `/login`, `/onboarding`, role-restricted UI, and read-only affordances were not reachable. Loading and fetch-error states could not be forced. Attachment upload, work-note publish/edit/delete, GitHub App reset, sign-out, OS theme following, macOS `⌘K`, and touch drag were not exercised. Several empty states were verified in source only. See `COVERAGE.md` for the full list.
