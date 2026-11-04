# Issues and Inbox coverage

Revision: 3d229791dadf073eab2c22302d1d59b3c421c81c
Server: http://127.0.0.1:3002
Browser session: ux-issues

| Route / interaction | Desktop | Tablet | Mobile | Light | Dark | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/issues` default, grouped by status | ✅ | ✅ | ✅ | ✅ | ✅ | audited | 17 seeded issues at start; 24 after intake accepts. Tablet title column collapses to 102px (finding). |
| `/issues` toolbar: search, status, priority, assignee, group | ✅ | — | — | ✅ | — | audited | One grid row of 5 controls. Search is 396px wide at 1440 and the full placeholder is legible — #16 no longer reproduces. |
| `/issues` search + URL state (`?q=`) | ✅ | — | — | ✅ | — | audited | 250ms debounce; URL updates; ⌘/Ctrl+K focuses `#issue-search` (real key press). |
| `/issues` empty result | ✅ | — | — | ✅ | — | audited | Bordered centred empty state with search icon and Clear filters. Count 0 in heading. |
| `/issues` active filter count + Clear | ✅ | — | — | ✅ | — | audited | Header "Clear N active filters" resets selects and search. |
| `/issues` Filters offcanvas (State, Repo, Size, Labels, Planned, Milestone) | ✅ | — | — | ✅ | — | audited | 400px right drawer; heading "Filters" appears twice; Clear does not clear search (finding). Not checked in dark. |
| `/issues` status filter vs Blocked rows | ✅ | — | — | ✅ | — | audited | `?status=in-progress` returns FUN-6, whose Status cell reads "Blocked" under an "In Progress" group header. |
| `/issues` grouping: status, priority, none | ✅ | — | — | ✅ | — | audited | Priority groups P1/P2/P3 + "No priority". Grouping is stored in localStorage and is not part of the URL. |
| `/issues` group collapse/expand | ✅ | — | — | ✅ | — | audited | Button with `aria-expanded`; chevron visible only on hover/focus. Production extension not in A. |
| `/issues` row hover/focus/Enter, title link | ✅ | — | — | ✅ | — | audited | Focus ring visible; Enter navigates. Row has `tabindex=0` in addition to the title link (finding). |
| `/issues` long title / unbreakable token | ✅ | — | ✅ | ✅ | — | audited | 120-char slug wraps in the title cell at 1440 (89px row) and at 390 (163px row); `scrollWidth` stays 390. No overflow. |
| `/issues` loaded-window pagination / skeleton / fetch error | — | — | — | — | — | not audited | 22 rows fit one page; no error induced. |
| Issue detail `/issues/demo/funnel/1` default | ✅ | ✅ | ✅ | ✅ | ✅ | audited | Document, Activity, Work notes, Attachments, Properties, Details, Time, Delays. |
| Issue detail — blocked `demo/funnel/8` | ✅ | ✅ | — | ✅ | ✅ | audited | Separate blocked panel; raw re-check date `2026-11-09`. |
| Issue detail — epic `demo/funnel/10` | ✅ | — | — | ✅ | — | audited | "Epic" only in Details card; no epic badge in header/index. |
| Issue detail — closed `demo/funnel/5` (closed during audit, then reopened) | ✅ | — | — | ✅ | — | audited | Close posts required note as comment; header reads Closed; struck-through not visible on detail. |
| Untriaged alert `/inbox/demo/funnel/2` | ✅ | — | — | ✅ | — | audited | Route 307-redirects to `/issues/demo/funnel/2`; alert offers Accept + Open Inbox (no Decline). |
| Properties — status change | ✅ | — | — | ✅ | — | audited | Commits immediately; header/meta update; no activity event appended. |
| Properties — Done → close dialog → Cancel | ✅ | — | — | ✅ | — | audited | Dialog is good; after Cancel the select still reads "Done" while the issue is In progress (finding). |
| Properties — Done → close with note | ✅ | — | — | ✅ | — | audited | Note becomes comment; no success message beyond the status change. |
| Properties — closed → status → reopen dialog → Cancel | ✅ | — | — | ✅ | — | audited | Same stale-select defect in reverse (header Closed, select In Review). |
| Properties — reopen with note | ✅ | — | — | ✅ | — | audited | Reopen button disabled until note typed; success. |
| Properties — impact/urgency, assignee, milestone, planned, size, labels | — | — | — | — | — | partial | Rendered; only status was written. Planned correctly disabled with "Add a size before planning this issue." |
| Title inline edit | ✅ | — | — | ✅ | — | audited | Click heading → borderless input; Escape cancels; blur/Tab commits with no Save/Cancel or confirmation. |
| Description edit | ✅ | — | — | ✅ | — | audited | Six-row Markdown textarea with Cancel/Save. |
| Comment composer: focus, empty submit, internal note | ✅ | — | — | ✅ | — | audited | Collapsed 1-row box expands on focus; empty submit no-ops; internal note added to Work notes. |
| Public comment submit | ✅ | — | — | ✅ | — | audited | Blue Comment submits; timeline appends; inline "Comment posted." feedback; textarea clears. |
| Work notes: publish, edit, delete | — | — | — | — | — | not audited | Actions visible on the note row. |
| Attachments upload | — | — | — | — | — | not audited | Dropzone rendered only. |
| Block issue dialog | ✅ | — | — | ✅ | — | audited | Required fields; primary button disabled until valid; Cancel/Escape close. |
| Mark as epic / Remove epic | — | — | — | — | — | not audited | Rendered in Details card. |
| Watch toggle | ✅ | — | — | ✅ | — | audited | "Not watching" → "Watching", no toast. |
| Copy as Markdown | ✅ | — | — | ✅ | — | audited | Real click flips to "Copied" + check for 2s; clipboard denial shows inline error. |
| Missing issue `/issues/demo/funnel/999` | ✅ | — | — | ✅ | — | audited | "Issue demo/funnel#999 is not mirrored" + Retry + Return to Issues; Open in GitHub still offered. |
| Issue detail mobile stacking / editing order | — | — | ✅ | ✅ | ✅ | audited | Properties begins ~1660px down a 3061px page, after Activity, Work notes, Attachments. |
| `/inbox` default table | ✅ | ✅ | ✅ | ✅ | ✅ | audited | 4 submissions + 2 untriaged issues at start. Six columns per A. |
| `/inbox` search (match / no match) | ✅ | — | — | ✅ | — | audited | URL `?q=`; counts follow the filtered set; no-match shows the success "Inbox is clear" alert (finding). |
| `/inbox` Accept submission | ✅ | — | — | ✅ | — | audited | Accepts server-side, then lands on a 404 "Submission not found" (finding). Reproduced twice. |
| `/inbox` Decline → confirm modal → Dismiss | ✅ | — | — | ✅ | — | audited | Confirmation modal is clear; Dismiss then lands on the same 404 (finding). |
| `/inbox` issue "Triage…" select | ✅ | — | — | ✅ | — | audited | Row removed optimistically; summary shows "0 untriaged issues" while one row remains (finding). |
| `/inbox` empty state (genuine) | ✅ | ✅ | ✅ | ✅ | — | audited | Success alert "Inbox is clear. Nothing is waiting for triage." Desktop, tablet and mobile captured. |
| `/inbox` empty state at tablet/mobile | ✅ | ✅ | ✅ | ✅ | — | audited | Same success alert; no table/header leftovers. |
| Submission detail `/inbox/submission/<id>` | ✅ | — | ✅ | ✅ | — | audited | `/inbox/submission/1` 404s; IDs are `demo-intake-*`/UUIDs. Repository + Size + Triage/Dismiss/Mark duplicate. |
| Submission detail — Mark as duplicate dialog | ✅ | — | — | ✅ | — | audited | Lists issues by `#n` (not FUN-n) in a native select; Cancel returns. |
| Submission detail — Triage as issue | ✅ | — | — | ✅ | — | audited | Returns to Inbox but keeps the consumed row and stale counts until reload (finding). |
| `/inbox/.../999` invalid submission id | ✅ | — | — | ✅ | — | audited | Global 404 with "Back to Issues" (not Inbox). |
| `/inbox/demo/funnel/2` legacy preview | ✅ | — | — | ✅ | — | audited | 307 redirect to `/issues/demo/funnel/2` by design. |
| Dark theme for primary screens | ✅ | ✅ | ✅ | — | ✅ | audited | Index, detail, inbox, submission detail checked at 1440/768/390 for index and inbox; detail at 1440/768/390. |
| Bulk triage / bulk selection | — | — | — | — | — | n/a | Not implemented; tracked as #30. |

## Untested / gaps

- `/issues` loading skeleton and fetch-error state (no request failure induced); "Loading more…" not exercised.
- Issue detail loading spinner and permission/read-only variant (demo user is admin).
- Public comment submission; work-note edit/publish/delete; attachment upload/download.
- Non-status property writes (assignee, milestone, size, labels, impact/urgency) and their failure paths.
- Sorting: no sort control exists on `/issues` (Composition A defines none). Not a defect, but no way to sort by priority/updated.
- Middle-click / Ctrl-click on issue rows (real link exists in the title, so expected to work; not tested).
- Inbox empty state at tablet/mobile.
- Inbox submission detail in dark theme and tablet.
- Inbox pagination (queue never exceeded one page).

## Fixture notes

- The brief's `/inbox/submission/1` is not a valid id on this instance: seeded submissions are `demo-intake-1…4`, and newly created ones are UUIDs. Use the ids from `/inbox` links.
- No Done/closed issues are seeded in `demo/funnel`; a closed-state pass required closing `demo/funnel/5` (done, then reopened).
- The demo instance accumulated audit data: submissions accepted/dismissed, two new intake rows, issues FUN-15–FUN-19, PLT-5/FUN-2 triaged, FUN-1 status changed to In progress, FUN-5 closed and reopened with two comments, one internal work note on FUN-1. The FUN-1 title was restored to its seed value.
