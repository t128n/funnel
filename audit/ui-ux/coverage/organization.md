# Organization coverage

Revision: 3d229791dadf073eab2c22302d1d59b3c421c81c
Server: http://127.0.0.1:3004
Browser session: ux-org

| Route / interaction | Desktop | Tablet | Mobile | Light | Dark | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/epics` default list | ✅ | ✅ | ✅ | ✅ | ✅ | audited | 1 epic. Table needs 1188px at 768, 1198px at 390. |
| `/epics` title click | ✅ | — | — | ✅ | — | audited | Clicking the title cell does not navigate; only the `demo/funnel#10` ref is a link. |
| `/epics` row/ref link | ✅ | ✅ | ✅ | ✅ | ✅ | audited | Ref link opens epic detail. |
| `/epics` empty state | — | — | — | — | — | not audited | Requires zero epics; would need DB deletion. Code inspected only. |
| `/epics/demo/funnel/10` default | ✅ | ✅ | ✅ | ✅ | ✅ | audited | No breadcrumb; header status reads “Unconfirmed”. |
| `/epics/.../10` add child — open modal | ✅ | — | — | ✅ | ✅ | audited | 16 candidates, search field, disabled confirm. |
| `/epics/.../10` add child — select + submit | ✅ | — | — | ✅ | — | audited | Added `demo/funnel#1`, list updated to 3 children, no confirmation toast. |
| `/epics/.../10` add child — no search match | ✅ | — | — | ✅ | — | audited | Inline “No issue matches …” message. |
| `/epics/.../10` remove child | ✅ | — | — | ✅ | — | audited | Immediate removal, no confirmation or undo; `#1` removed to restore 2 children. |
| `/epics/.../3` empty children (temp. epic) | ✅ | — | — | — | ✅ | audited | “No children yet.” text, no action button in the empty block. Removed epic afterwards. |
| `/milestones` default list | ✅ | ✅ | ✅ | ✅ | ✅ | audited | Grouped by repo; 3 milestones. Table 716px wide at 390. |
| `/milestones` overdue milestone | ✅ | — | — | — | ✅ | audited | Temporarily set `Docs refresh` due to 2026-10-20; due date rendered exactly like future dates. Restored. |
| `/milestones` Timeline action | ✅ | — | — | ✅ | — | audited | Secondary button opens `/timeline`. |
| `/milestones` empty state | — | — | — | — | — | not audited | Requires zero milestones. Code inspected only. |
| `/milestones/demo/funnel/1` default | ✅ | — | ✅ | ✅ | ✅ | audited | Issue list, progress, due date, 6 rows. |
| `/milestones/.../1` set milestone (issue #2) | ✅ | — | — | ✅ | — | audited | Set from issue Properties; FUN-2 appeared on milestone page. |
| `/milestones/.../1` clear milestone (issue #2) | ✅ | — | — | ✅ | — | audited | Cleared; FUN-2 disappeared. Restored to “No milestone”. |
| `/milestones/.../2` overdue variant | ✅ | — | — | — | ✅ | audited | Due 2026-10-20 shown as plain text; restored due date. |
| `/milestones/.../999` error | ✅ | — | — | — | ✅ | audited | 404 without app shell; message “Milestone is not mirrored”. |
| `/notifications` default unread | ✅ | ✅ | ✅ | ✅ | ✅ | audited | 4 unread; bell badge and page count agree. |
| `/notifications` mark one read | ✅ | — | — | ✅ | — | audited | Row moves to Read; header and bell badge change to 3. |
| `/notifications` mark all read | ✅ | — | — | ✅ | — | audited | Button disables, Unread section disappears, bell badge clears. Restored unread state afterwards. |
| `/notifications` 100-row overflow | ✅ | — | — | — | ✅ | audited | Inserted 110 unread rows: header showed 110 unread, list rendered 100 rows, no pager. Rows deleted and the 4 seeded notifications restored to unread. |
| `/notifications` link/row click | ✅ | — | — | ✅ | — | audited | Title and ref links both target the issue; title marks unread before navigating. |
| `/notifications` zero-item empty state | — | — | — | — | — | not audited | Requires deleting all notifications; code inspected only. |
| `/attention` default (All) | ✅ | ✅ | ✅ | ✅ | ✅ | audited | Overdue, Due today, Upcoming 7 days; 3 blocked issues. |
| `/attention` Mine | ✅ | — | — | ✅ | — | audited | Shows only FUN-8 assigned to the demo user. |
| `/attention` row menu | ✅ | — | — | ✅ | — | audited | Re-check presets, assign, mark done, update block, unblock, open issue. |
| `/attention` reschedule (quick preset) | ✅ | — | — | ✅ | — | audited | “Tomorrow” moved FUN-6 from Overdue to Upcoming 7 days; restored to 2026-11-02. |
| `/attention` missing re-check date | ✅ | — | — | ✅ | ✅ | audited | Cleared FUN-6 date through Update block; it moved to “No re-check date”, then restored to 2026-11-02. |
| `/attention` empty state | — | — | — | — | — | not audited | Mine has 1 item; All has 3. Code inspected only. |
| `/attention` mark done / unblock | — | — | — | — | — | not audited | Destructive; not exercised. |
| `/issues?assignee=me` | ✅ | — | ✅ | ✅ | ✅ | audited | Same page as `/issues`; assignee select shows “Assigned to me”; `aria-current` is only on the hidden “My Issues” item in More. |
| `/issues?assignee=me` clear filter | — | — | — | — | — | not audited | Link present; clearing returns to `/issues`. |
| `/issues?assignee=me` empty | — | — | — | — | — | not audited | Demo user has 6 assigned issues. |
| Organization 404s | ✅ | — | — | — | ✅ | partial | Checked epic and milestone detail 404s; shared error page. |
| Loading states | — | — | — | — | — | not audited | Routes are server-rendered; no loading state observed. |
| Keyboard focus on attention rows | ✅ | — | — | ✅ | — | partial | Stretched row link takes focus; quick actions are focus-within visible. |

## Observations (not findings)

- **Milestones header has no summary.** `/epics` shows “1 open · 1 total”, `/notifications` shows “4 unread”, `/attention` shows “3 blocked issues”; `/milestones` shows only the title. A count or scope line would match the other organization indexes.
- **Fixture counts vs listed issues.** Milestone `v2.0 — cockpit` shows `2 / 10 closed` but lists 6 issues; `Docs refresh` shows `1 / 6 closed` but lists 5. The seed sets GitHub-style counts independently of the mirrored issue rows. Contradictory, but attributable to demo data rather than the page logic.
- **Attention count mismatch.** The More menu shows `Attention 2` (overdue + due today) while the page header says `3 blocked issues` (includes upcoming). No label explains the different denominators.
- **Overflow destinations have no closed-state active marker.** On `/epics`, `/milestones`, `/attention` the More toggle looks identical to inactive; `aria-current` lives on the dropdown item only. Owned by the shell workstream.
- **Repository scope control is present but inert on organization pages.** `/epics`, `/milestones`, `/notifications`, `/attention` do not read `?repo`; selecting a repository changes the navbar label only. Related to open #99; shell workstream owns the control.
- **Milestone detail labels are plain meta text.** The shared issue rows render labels as comma-separated text rather than the bordered badges used on `/issues`.
- **Attention quick actions and menu duplicate each other.** Every hover action is repeated in the persistent `…` menu; this adds tab stops but guarantees a touch path.
- **Cross-view IA.** Inbox (untriaged queue), My Issues (assigned open issues), Attention (blocked, by re-check), and Notifications (event feed) are four distinct concepts; no two pages show the same rows with the same purpose. The only overlap is that My Issues is exactly the Issues index with `assignee=me`, which is a reasonable shortcut but needs its own heading (finding below). Notifications is the bell's destination, not a duplicate of it.
- **Attention explains itself through the blocker line** (“Upstream typings break on `drizzle-kit`”), so the reason for listing is present. The ambiguity is the date vocabulary, recorded as a finding.
- **No page-level success toast on any organization mutation.** Add/remove child, set/clear milestone, and re-check changes update the page silently; the changed content is the only feedback. This is consistent with the app's immediate-commit model and not filed separately.
- **Overdue demonstration required a temporary data edit.** `mirror_milestone.due_on` was set to 2026-10-20 and restored immediately; no source files were touched.
- **Epic membership mutation test.** FUN-3 was temporarily marked as an epic and then unmarked; no other data changed.
- **Blocking test appended comments.** Updating FUN-6's block twice posted comments to that issue; acceptable on the disposable instance.
