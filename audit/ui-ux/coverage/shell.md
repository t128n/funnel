# Shell and navigation coverage

Revision: 3d229791dadf073eab2c22302d1d59b3c421c81c
Server: http://127.0.0.1:3001
Browser session: `ux-shell`

Legend: ✅ exercised, — not exercised.

| Route / interaction | Desktop | Tablet | Mobile | Light | Dark | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/inbox` shell render | ✅ | ✅ | ✅ | ✅ | ✅ | audited | 56px dark navbar, 6 primary links + More, brand, right cluster |
| `/issues` shell render | ✅ | ✅ | ✅ | ✅ | ✅ | audited | Navbar, breadcrumb, centered 1320px main |
| `/issues/demo/funnel/1` shell render | ✅ | — | — | ✅ | — | partial | Navbar + breadcrumb + container-lg; detail content itself not audited |
| `/board` shell render | ✅ | — | ✅ | ✅ | — | partial | Full-bleed container-fluid; navbar active; repo-scope mobile case tested |
| `/settings` shell render | ✅ | — | ✅ | ✅ | — | partial | No breadcrumb; settings sidebar starts at lg |
| `/notifications` shell render | ✅ | — | — | ✅ | — | partial | No breadcrumb, no current-page indicator for bell |
| `/day` shell render | ✅ | — | — | ✅ | — | partial | No active navbar destination; no breadcrumb |
| `/epics` shell render | ✅ | — | — | ✅ | — | partial | More menu active item inspected; no breadcrumb |
| `/nonexistent-route` (404) | ✅ | — | ✅ | ✅ | — | partial | Outside app shell; mobile checked for overflow only |
| Navbar active state / `aria-current` | ✅ | — | — | ✅ | — | audited | Primary routes correct; all 5 overflow routes unrepresented |
| More dropdown: My Issues | ✅ | — | — | ✅ | — | audited | Opens `/issues?assignee=me`; no visible current state |
| More dropdown: My Day | ✅ | — | — | ✅ | — | audited | `/day` |
| More dropdown: Attention | ✅ | — | — | ✅ | — | audited | `/attention`, badge 2 |
| More dropdown: Epics | ✅ | — | — | ✅ | — | audited | `/epics` |
| More dropdown: Milestones | ✅ | — | — | ✅ | — | audited | `/milestones` |
| More dropdown keyboard | ✅ | — | — | ✅ | ✅ | audited | Enter/Tab work; arrows/Escape do not |
| Repository scope: open/menu | ✅ | — | ✅ | ✅ | — | audited | All repositories, demo/funnel, demo/platform |
| Repository scope: apply on `/issues` | ✅ | — | — | ✅ | — | audited | URL `?repo=demo%2Fplatform`, rows change |
| Repository scope: apply on `/inbox` | ✅ | — | — | ✅ | — | audited | Intake submissions from demo/funnel remain |
| Repository scope: non-list page | ✅ | — | — | ✅ | — | audited | `/settings?repo=demo%2Fplatform` relabels shell but scopes nothing |
| Repository scope: persistence | ✅ | — | — | ✅ | — | audited | Lost on every navbar navigation |
| Repository scope: 992–1199 label | ✅ | — | — | ✅ | — | audited | Label hidden, folder icon only |
| Search via navbar button | ✅ | — | ✅ | ✅ | — | audited | Focuses page `#issue-search`; `/settings` + `/notifications` jump to `/issues` |
| Search via `Ctrl+K` / `/` | ✅ | — | — | ✅ | — | audited | Works from `/issues`, `/board`, `/settings`, detail, notifications |
| Search query / results | ✅ | — | ✅ | ✅ | — | audited | Title/body words work; `FUN-1` returns empty |
| Search empty state | ✅ | — | — | ✅ | — | audited | “No issues match this view”, Clear filters |
| Search width / #16 | ✅ | ✅ | ✅ | ✅ | — | audited | 396px at 1440; truncates at 992–1024; full row below 768 |
| Notification bell | ✅ | — | ✅ | ✅ | ✅ | audited | Links to `/notifications`, badge 4; badge overlaps theme control by ~1.5px |
| Theme menu: Light/Dark/Match system | ✅ | — | ✅ | ✅ | ✅ | audited | Persists in `funnel:theme`, survives reload; selection visual-only |
| Account menu: Account | ✅ | — | ✅ | ✅ | ✅ | audited | `/settings`; mobile menu stays open |
| Account menu: Settings | ✅ | — | — | ✅ | ✅ | audited | Goes to `/settings/appearance` (not `/settings`) |
| Account menu: Sign Out | — | — | — | — | — | not audited | Not executed to preserve the demo session |
| Skip link | ✅ | — | — | ✅ | — | audited | Focused but painted under navbar; Enter moves focus to `#main` |
| Tab order | ✅ | — | — | ✅ | — | audited | Skip → brand → 6 links → More → repo → search → bell → theme → account → page |
| Responsive collapse <992 | — | ✅ | ✅ | ✅ | ✅ | audited | Toggler 45×30; expanded menu 386px pushes content |
| Mobile menu order / overflow | — | — | ✅ | ✅ | ✅ | audited | Links, More, repo, search, bell, theme, account; no horizontal overflow |
| Mobile menu close after nav | — | — | ✅ | ✅ | — | audited | Closes on primary links/search; stays open for repo, account, brand |
| Tablet 768x1024 | — | ✅ | — | ✅ | — | audited | Collapsed nav, 720px container |
| Laptop 992/1024/1199 navbar fit | ✅ | — | — | ✅ | — | audited | One row, no wrap; 22px slack at 992 |
| Dark navbar contrast | ✅ | — | ✅ | — | ✅ | audited | Navbar and body both `rgb(33,37,41)`, no border |
| Dark navbar focus | ✅ | — | — | — | ✅ | audited | Bootstrap blue glow on links; white outline on quiet controls |
| Breadcrumb semantics | ✅ | — | — | ✅ | — | audited | `nav` without `aria-label`; current item has `aria-current` |
| PageHeader / container widths | ✅ | ✅ | ✅ | ✅ | — | audited | 1320px at 1440; 720px at 768; board/day full-bleed |
| 404 shell | ✅ | — | ✅ | ✅ | — | partial | No navbar, no theme, duplicated message, Try Again loops |

## Observations (not filed as findings)

- The primary navbar has no accessible name; the breadcrumb `nav` is also unnamed. `/settings` shows the convention already used for its section nav (`aria-label="Settings"`).
- Only five routes use a breadcrumb (`/inbox`, `/issues`, detail, submission, plus settings’ sidebar). `/board`, `/day`, `/epics`, `/milestones`, `/attention`, `/notifications` start with a bare heading. The top-of-page rhythm therefore varies by 40px depending on route.
- `/board` and `/day` use `container-fluid px-3 px-lg-4` while all other audited pages use `container-xl`/`container-lg`. Full width suits the kanban/timeline surfaces, but the shell does not state that page-level rule anywhere.
- In the notification cluster the unread badge overlaps the theme button by ~1.5px at 390px and 1440px (badge right edge 1238.8, theme left edge 1237.3). At ≥100 unread (“99+”) the overlap would grow.
- Navbar icon controls are 31px tall and the mobile toggler 30px, below the 44px touch-target recommendation. This matches Composition A’s `size="sm"` example and is explicitly UNRESOLVED in §13.
- The brand links to `/issues`, while `/` redirects to `/inbox` and the 404 brand links to `/`. Home destinations are inconsistent; the PoC’s brand also targets Issues.
- The account menu labels `/settings` as “Account” and `/settings/appearance` as “Settings”; the latter is really Appearance, and the chosen label duplicates the section name.
- More-menu destinations define `icon` metadata that is never rendered. Dead data, not a UI defect.
- Navbar is not sticky, matching the PoC; deep pages scroll the shell out of view as designed.

## Untested / blocked

- **Long repository labels**: the demo DB only contains `demo/funnel` and `demo/platform`. I did not mutate data to add a long slug; the `d-xl-inline` label has no `text-truncate`, so wide labels remain unverified.
- **Multiple selected repositories**: `repoLabel` handles multiple `?repo=` values, but no UI path selects more than one; not exercised.
- **macOS `⌘ K` hint**: only Linux Chrome available; the shortcut label correctly shows `Ctrl K` there.
- **Sign Out**: not clicked (would end the demo session).
- **Match system** reacting to an OS-level scheme change: not exercised.
- **Loading/SSE shell states**: not part of the shell chrome under test; no skeleton in navbar.
- **Permission-limited shell**: demo user is admin; no lower-role variant available.
- **Long unread counts (99+)** and >2 repositories: no fixture.
- Authenticated error states other than 404 were not forced.
