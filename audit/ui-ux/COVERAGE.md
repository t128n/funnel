# Funnel UI/UX Audit — Coverage

**Revision audited:** `3d229791dadf073eab2c22302d1d59b3c421c81c` (`chore: version packages (#103)`)
**Audit date:** 2026-11-04
**Environment:** local dev server in demo mode, disposable SQLite databases, `agent-browser` 0.41.2 / Chrome 157
**Subagents:** 5 independent workstreams, each on its own app instance and browser session.

Legend: ✅ audited · ◐ partial · ⛔ blocked · — not applicable.

## Route inventory

| Route | Desktop | Tablet | Mobile | Light | Dark | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/inbox` | ✅ | ✅ | ✅ | ✅ | ✅ | audited | Table, search, accept, decline, empty, no-match |
| `/inbox/submission/[id]` | ✅ | — | ◐ | ✅ | ◐ | partial | Triage-as-issue, duplicate dialog, dismiss; mobile light only |
| `/inbox/[owner]/[repo]/[number]` | ✅ | — | — | ✅ | — | audited | Redirects to issue detail with untriaged alert |
| `/issues` | ✅ | ✅ | ✅ | ✅ | ✅ | audited | Toolbar, search, filters, grouping, empty, long title, focus |
| `/issues/[owner]/[repo]/[number]` | ✅ | ✅ | ✅ | ✅ | ✅ | audited | Body, properties, comments, work notes, close/reopen, blocked, missing |
| `/board` | ✅ | ✅ | ✅ | ✅ | ✅ | audited | Lanes, drag, keyboard move, card menu, WIP, done dialog, backlog |
| `/matrix` | ✅ | ✅ | ✅ | ✅ | ✅ | audited | Grid, selection, queue, rating guide, empty cell |
| `/matrix/[owner]/[repo]/[number]` | ✅ | — | — | ✅ | — | audited | Legacy redirect to issue detail |
| `/plan` | ✅ | ✅ | ✅ | ✅ | ✅ | audited | Week nav, capacity, over-capacity, remove, empty, unsized |
| `/day` | ✅ | ✅ | ✅ | ✅ | ✅ | audited | Empty, auto-plan, manual add, overlap, overbooked |
| `/timeline` | ✅ | ✅ | ✅ | ✅ | ✅ | audited | Chart, tooltip, labels, repo scope, dark, resize |
| `/epics` | ✅ | ✅ | ✅ | ✅ | ✅ | audited | List, title click, ref link, overflow |
| `/epics/[owner]/[repo]/[number]` | ✅ | ✅ | ✅ | ✅ | ✅ | audited | Header, rollups, add/remove child, empty children, status |
| `/milestones` | ✅ | ✅ | ✅ | ✅ | ✅ | audited | List, overdue, progress, overflow |
| `/milestones/[owner]/[repo]/[number]` | ✅ | — | ✅ | ✅ | ✅ | audited | Rows, progress, membership via issue, overdue, 404 |
| `/notifications` | ✅ | ✅ | ✅ | ✅ | ✅ | audited | Read/unread, mark one/all, links, 100-row cap, mobile titles |
| `/attention` | ✅ | ✅ | ✅ | ✅ | ✅ | audited | Buckets, unscheduled, row menu, update block |
| `/issues?assignee=me` (My Issues) | ✅ | — | ✅ | ✅ | ✅ | audited | Identity, active nav, empty not reached |
| `/settings` (Account) | ✅ | — | ✅ | ✅ | ✅ | audited | Profile, session, sign out not clicked |
| `/settings/appearance` | ✅ | — | — | ✅ | ✅ | audited | Radio state, theme apply, reload |
| `/settings/features` | ✅ | — | — | ✅ | — | audited | Toggle save, persistence |
| `/settings/availability` | ✅ | — | — | ✅ | — | audited | Blocked windows, timezone validation; feed create/revoke not run |
| `/settings/repositories` | ✅ | ✅ | — | ✅ | ✅ | audited | Add, invalid save, remove, confirm dialog |
| `/settings/projects` | ✅ | — | — | ✅ | — | audited | Add, remove, confirm |
| `/settings/intake` | ✅ | — | — | ✅ | — | audited | Default repo select |
| `/settings/board` | ✅ | — | ✅ | ✅ | ✅ | audited | WIP inputs, labels, mobile switcher |
| `/settings/planning` | ✅ | ✅ | — | ✅ | ✅ | audited | Long-form validation, maintainers |
| `/settings/notifications` | ✅ | — | — | ✅ | — | audited | Toggle save |
| `/settings/people` | ✅ | — | — | ✅ | — | audited | Role list; role change not executed |
| `/settings/github-app` | ✅ | — | — | ✅ | ✅ | audited | Read-only credentials, reset not executed |
| `/settings/sync` | ✅ | — | — | ✅ | — | audited | Numeric inputs |
| `/settings/session` | ✅ | — | — | ✅ | — | audited | Validation, keyboard save, success, unsaved loss |
| `/intake` | ✅ | ✅ | ✅ | ✅ | ✅ | audited | Empty, whitespace, valid submit, success, mobile |
| `/nonexistent-route` (404) | ✅ | — | ✅ | ✅ | ✅ | audited | Copy, actions, shell absence |
| `/issues/[owner]/[repo]/[number]` (missing) | ✅ | — | ✅ | ✅ | ✅ | audited | Error copy, dead GitHub link |
| `/milestones/.../999`, `/epics/.../999` | ✅ | — | — | — | ✅ | audited | Focused 404 surface |
| `/login` | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | blocked | Demo mode auto-authenticates and redirects to `/inbox` |
| `/onboarding/*` | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | blocked | Demo mode redirects to `/login` → `/inbox` |

## Interaction coverage

| Workflow | Coverage | Notes |
| --- | --- | --- |
| Global navbar search (button, `Ctrl/Cmd+K`, `/`) | ✅ | Page-local focus behavior, cross-route jumps, empty results |
| Repository scope | ✅ | Apply on issues/inbox/settings, navigation persistence, 992–1199 label |
| Navbar menus (More, account, theme, repo) | ✅ | Pointer and keyboard; Escape/arrows tested |
| Mobile navigation collapse | ✅ | Open/close, navigation from menu, stuck-open states |
| Skip link / tab order | ✅ | Focus paint order measured with `elementsFromPoint` |
| Issue search / filters / grouping / URL state | ✅ | Search debounce, empty state, group collapse, clear behavior |
| Issue metadata editing | ✅ | Status, close/reopen, comment, work note, title/body edit; other properties rendered only |
| Inbox triage | ✅ | Accept, decline/dismiss, triage-as-issue, subscription detail |
| Board drag and keyboard move | ✅ | Pointer and keyboard; stale lane and card menu defects |
| Board Done resolution dialog | ✅ | Open, cancel, required note |
| Matrix classification | ✅ | Cell select, queue, rating guide, empty cell |
| Plan week navigation / capacity / remove | ✅ | Over-capacity, empty week, unsized planned issue |
| Day auto-plan / add / remove / overlap | ✅ | Empty and overbooked |
| Timeline hover / scope / resize | ✅ | Tooltip, labels, mobile, dark |
| Epic membership | ✅ | Add/remove child, empty children, search |
| Milestone membership | ✅ | Set/clear from issue Properties |
| Notifications read state | ✅ | Mark one/all, 110-row overflow |
| Attention re-check | ✅ | Buckets, unscheduled, update block |
| Settings save / validation | ✅ | All sections at desktop; representative keyboard/validation |
| Destructive confirmations | ✅ | Keyboard and pointer; focus behavior |
| Unsaved-change navigation | ✅ | Settings section switch, mobile switcher |
| Public intake | ✅ | Empty, whitespace, valid, success |
| Read-only (role-gated) UI | ⛔ | Demo session is admin; non-admin visibility not exercised |
| Attachment upload | ⛔ | Not exercised |
| Work-note publish/edit/delete | ◐ | Internal note creation audited; publish lifecycle not |
| Loading / skeleton / fetch-error states | ⛔ | Not reliably forceable in demo; source-only inspection |
| Sign out / GitHub App reset | ⛔ | Deliberately not executed (would end or compromise the instance) |
| OS theme switching | ⛔ | Explicit Light/Dark tested; system-following not |
| macOS `⌘K` | ⛔ | Linux environment; `Ctrl+K` and `/` tested |
| Touch drag-and-drop | ⛔ | Pointer drag and keyboard move only |

## Coverage limitations

- Demo mode is pre-authenticated as an admin. `/login`, `/onboarding`, role-restricted UI, and read-only affordances were not reachable.
- No loading or fetch-error state could be forced without altering the app; these remain unverified.
- Some empty states required destructive fixture changes and were verified in source only: empty Epics, Milestones, Notifications, Attention (Mine), and My Issues.
- Mutations were confined to each workstream's disposable database. One workstream temporarily created 110 notifications and removed them; another temporarily changed a milestone due date and restored it.
- Screenshots were captured from the running app at 1440×900, 768×1024 and 390×844 in Light and Dark.
