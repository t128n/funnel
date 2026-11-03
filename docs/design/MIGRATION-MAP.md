# Migration map — production to Composition A

**Status:** Design handoff, not an implementation plan  
**Target:** Composition A — Traditional Bootstrap Application  
**Design authority:** [`COMPOSITION-A.md`](./COMPOSITION-A.md)

This map describes how the current production application should move to the approved Composition A shell and page patterns. It is written for the Staff Software Architect. It does not modify production code and does not prescribe internal application architecture beyond visible composition and Sveltestrap usage.

## Evidence base and limits

The production source tree was not present in the accessible workspace. Current-state observations come from the nine supplied production screenshots and the visible behavior in them. Route names are inferred from navigation labels; component names are functional descriptions rather than confirmed file names. The architect must reconcile this map with the actual route table and component tree.

Current production evidence:

| Screenshot | Current state |
| --- | --- |
| [`inbox-light.png`](../../screenshots/inbox-light.png) | Dark navbar, 232px sidebar, split Inbox list and empty detail pane, 2 untriaged issues |
| [`issues-light.png`](../../screenshots/issues-light.png) | Split Issues list and empty detail pane, two toolbar rows, grouped list |
| [`issue-light.png`](../../screenshots/issue-light.png) | Selected issue detail in the right pane, metadata pills, activity, comment composer |
| [`board-light.png`](../../screenshots/board-light.png) | Board/Backlog toggle, four lane columns, search, All/Mine, Filters, expand control |
| [`matrix-light.png`](../../screenshots/matrix-light.png) | Impact/Urgency matrix, rating guide, search, All/Mine, Filters |
| [`plan-light.png`](../../screenshots/plan-light.png) | Week/Cycle/Milestones/Day views, capacity bars, scheduled issues, Schedule Issue action |
| [`timeline-light.png`](../../screenshots/timeline-light.png) | Milestone timeline, repository scope, legend, Milestones action |
| [`settings-planning-light.png`](../../screenshots/settings-planning-light.png) | Global sidebar plus settings subnavigation and Planning form |
| [`intake-light.png`](../../screenshots/intake-light.png) | Standalone public intake form with no app shell |

The approved A visuals are in:

- [`desktop-a-issues.png`](../../poc/compositions/screenshots/desktop-a-issues.png)
- [`desktop-a-issue.png`](../../poc/compositions/screenshots/desktop-a-issue.png)
- [`desktop-a-activity.png`](../../poc/compositions/screenshots/desktop-a-activity.png)
- [`desktop-a-inbox.png`](../../poc/compositions/screenshots/desktop-a-inbox.png)
- [`mobile-a-issues.png`](../../poc/compositions/screenshots/mobile-a-issues.png)
- [`mobile-a-issue.png`](../../poc/compositions/screenshots/mobile-a-issue.png)
- [`mobile-a-inbox.png`](../../poc/compositions/screenshots/mobile-a-inbox.png)

## 1. Current shell and target shell

### Current

- Dark global navbar with brand, repository scope, global Search, notification bell, theme control, and user menu.
- Persistent 232px light sidebar with grouped navigation:
  - Personal: Inbox (count), My Issues, Notifications, Attention.
  - Workspace: Issues, Board, Matrix, Plan, Epics, Milestones, Timeline.
  - Configuration: Settings.
- Content area to the right of the sidebar.
- Issues and Inbox use a two-pane master-detail layout: narrow list plus independently scrolling detail pane.
- Board, Matrix, Plan, and Timeline use the remaining content width, still to the right of the sidebar.
- Settings uses the global sidebar plus a local settings subnavigation column.
- Responsive: the sidebar becomes an off-canvas drawer below `xl` (1200px) in the PoC’s implementation. The production breakpoint should be verified.

### Target Composition A

- One dark global navbar, 56px measured height, containing:
  - Brand.
  - Primary navigation.
  - Repository scope.
  - Search.
  - Existing global controls (notification bell, theme, user) as compact navbar controls.
- The A navbar is in normal document flow, not sticky. Verify the current production positioning; if production is sticky today, confirm that change with product.
- No persistent global sidebar on any app route.
- Normal page content with Bootstrap containers.
- Issues and Inbox are normal pages with tables.
- Issue detail is a dedicated route with an 8/4 document/properties split.
- Settings keeps its local settings subnavigation inside the page; “no sidebar” refers to the global navigation rail, not a legitimate local settings nav.
- Responsive: navbar collapses below `lg` (992px) using a Bootstrap `Collapse`, not an off-canvas global drawer.
- Board, Matrix, Plan, Timeline, Epics, and Milestones keep their view-specific canvases; only the global shell and surrounding controls change.

**Approved principle:** the shell is one navigation layer. No route may reintroduce the old global sidebar or a second global nav rail.

## 2. Navigation coverage

Composition A demonstrates six primary text links:

1. Inbox
2. Issues
3. Board
4. Matrix
5. Plan
6. Timeline

Production exposes additional destinations and controls. The final primary set is an **unresolved product decision**. The map below defines where each current destination must remain reachable and what constraints apply.

| Current destination | Target home | Status | Notes |
| --- | --- | --- | --- |
| Inbox | Primary navbar | Recommended | Preserve count. Count placement is unresolved. |
| My Issues | Primary navbar or saved-filter entry in Issues | Unresolved | Preserve “assigned to me” semantics. Do not silently remove it. |
| Notifications | Navbar bell icon | Recommended | Existing global control; preserve badge and menu/destination. |
| Attention | More menu or Inbox filter | Unresolved | Do not duplicate it as both a nav link and an icon without a product decision. |
| Issues | Primary navbar | Approved by A demonstration | Preserve all filters and deep links. |
| Board | Primary navbar | Approved by A demonstration | Keep view-specific canvas. |
| Matrix | Primary navbar or More | Approved by A demonstration; overflow unresolved | A shows Matrix in primary navigation. If the final primary set drops it, use More. |
| Plan | Primary navbar | Approved by A demonstration | Keep view-specific canvas. |
| Epics | More menu | Unresolved | No production screenshot provided. Preserve existing route. |
| Milestones | More menu | Unresolved | No production screenshot provided. Preserve existing route. |
| Timeline | Primary navbar | Approved by A demonstration | Keep timeline canvas. |
| Settings | User menu or More | Unresolved | Keep reachable; settings has its own local subnav. |
| Public intake | Standalone public route | Preserve | Do not put the app navbar/sidebar on the public form. |
| Profile / Preferences / Sign out | User menu | Preserve | Existing user menu already lives in the navbar. |

### Navigation constraints

- At desktop width, keep at most six visible text destinations in the navbar. Use a More dropdown for overflow.
- Do not allow the navbar to wrap into a second row.
- Keep the notification bell and theme control as icon controls if they remain in the product.
- Keep repository scope in the navbar, not in the page toolbar.
- The active destination uses `aria-current="page"` and the Bootstrap active style.
- Below `lg`, the navbar collapses into a vertical Bootstrap `Collapse`; it is not an off-canvas drawer.
- Closing behavior: nav link click closes the collapse; opening search closes the collapse.

### Recommended primary set for review

The safest starting point, given A’s demonstrated six-link nav, is:

**Inbox · Issues · Board · Matrix · Plan · Timeline**, with **More** for My Issues, Attention, Epics, and Milestones, the bell for Notifications, and Settings in the user menu.

This is a recommendation, not an approved decision. The product owner must confirm My Issues, Attention, and Settings placement.

## 3. Route-by-route migration

### 3.1 Inbox — `/inbox`

**Current pattern**

- Split pane: left list of untriaged issues, right detail pane.
- Empty detail pane on first load.
- Header count, search, Filters.
- Issue rows show ID, title, priority, size, age, assignee.
- Sidebar Inbox count.

**Target A pattern**

- One `container-xl py-4` page.
- “Workspace / Inbox” breadcrumb.
- Heading, “N untriaged issues · 0 pending submissions,” search on the right.
- One conventional table: Issue, Title, Repository, Source, Submitted, Triage.
- Inline Accept and Decline.
- No detail pane; clicking a title opens the dedicated issue route.
- Empty state: success alert.

**Preserve**

- Triage actions and their semantics.
- Inbox count and pending-submission count.
- Search within Inbox.
- Repository scope.
- Source/submitter data.
- Any production bulk actions, if they exist (not demonstrated).

**Retire / change**

- Split list/detail layout.
- Empty detail pane.
- Right-pane close/back behavior.
- Pane width and scroll CSS.
- The sidebar Inbox badge is replaced by a navbar count treatment; placement unresolved.

**Responsive and keyboard**

- Below `md`, hide Issue/Source/Submitted columns and show ID above the title.
- Repository column hidden below `lg`.
- Triage buttons remain visible and keyboard reachable.
- Verify no horizontal overflow at 390px.
- Real title links; preserve focus after action.

**Dependencies**

- Intake/pending-submission counts.
- Permission to accept/decline.
- Confirmation/bulk-action policy, if product requires it.

---

### 3.2 Issues index — `/issues`

**Current pattern**

- Split pane: left list, right selected issue detail.
- Empty right pane on first load.
- Two toolbar rows:
  1. Search + Filters.
  2. All/Mine segmented control, Open dropdown, Group dropdown.
- Grouped issue list with IDs, titles, priority, size, age, assignee, labels.
- Sidebar Issues destination.

**Target A pattern**

- One `container-xl py-4` page.
- “Workspace / Issues” breadcrumb.
- Heading + visible count; description line.
- One toolbar row:
  - Search (`col-12 col-lg-4`).
  - Status (`col-6 col-lg-2`).
  - Priority (`col-6 col-lg-2`).
  - Assignee (`col-6 col-lg-2`).
  - Group (`col-6 col-lg-2`).
- Grouped six-column table: Issue, Title, Status, Priority, Assignee, Updated.
- Group header rows with label and count.
- Row click and title link open `/issues/:id`.
- Empty state with Clear filters.
- Footer “Showing N issues.”

**Preserve**

- Search across titles, bodies, IDs, labels, people.
- Repository scope via navbar.
- All/Mine semantics, mapped into the assignee filter or a compact segmented control inside the one-row toolbar. **UNRESOLVED exact treatment.**
- Open/closed/status filtering. The current “Open” dropdown must not become a second toolbar row.
- Grouping by status, priority, assignee, none.
- Counts and deep links.
- Existing saved views or URL state, if present.

**Retire / change**

- Split list/detail pane.
- Empty detail pane.
- Second toolbar row.
- Separate narrow list widths.
- Pane-level scroll and mobile `detail-open` state.
- Metadata pills in the index, if any.

**Responsive and keyboard**

- Below `md`, hide ID/status/priority/assignee columns and show them in a metadata line under the title.
- Updated hidden below `lg`.
- Row focus must be visible; title must be a real link.
- At 992–1199px, the navbar is expanded in A; verify the six-link nav plus production controls fit before adding overflow items.
- No horizontal overflow at 390px.

**Dependencies**

- Route change for detail.
- All/Mine/saved-view product decision.
- Search index and filtering semantics.
- Pagination or result limits, if production uses them. A does not define pagination.

---

### 3.3 Issue detail — `/issues/:id`

**Current pattern**

- Right-hand detail pane inside the Issues route.
- Header line: repository#number, GitHub, Copy.
- Title.
- Metadata pill row: status, priority, size, assignee, milestone.
- Updated time.
- Epic link.
- Document body, activity, comments.
- Close X returns the pane to empty.

**Target A pattern**

- Dedicated route and page.
- `container-lg py-4`; breadcrumb “Issues / ID.”
- Repository/ID line; `h3` title; status, labels, opened/updated.
- “Open in GitHub” outline-secondary button.
- 8/4 layout:
  - Left: document, activity, comments, composer.
  - Right: Properties card + Details card.
- Untriaged alert with Accept/Decline when applicable.
- Invalid ID: “This issue does not exist” alert with return link.

**Preserve**

- Editing status, priority, size, assignee, milestone. In A, size is read-only in Details; current production may edit size. **UNRESOLVED whether size stays editable; if it must be editable, add it to Properties, which is a small extension of A.**
- Copy link and GitHub actions. A shows GitHub; Copy is not in the A PoC. Preserve Copy in the header if production already has it.
- Epic, labels, opened date, updated date.
- Comments, activity, composer, markdown/code rendering.
- Permissions and read-only states.
- Deep links and browser back.

**Retire / change**

- Right-pane close X.
- Metadata pill row.
- Split-pane detail container and scroll context.
- Pane-specific responsive state.

**Responsive and keyboard**

- At <`lg`, columns stack. Properties/Details currently come after document/activity in DOM order. **UNRESOLVED** whether to move Properties before activity on mobile.
- Real title link/row link from index.
- Selects commit immediately; focus remains in control after change.
- Comment Cmd/Ctrl+Enter.
- Visible focus rings on selects, buttons, links.
- Restore focus to the originating row on back.

**Dependencies**

- Routing and deep-link stability.
- Metadata update API and activity event.
- Permissions.
- Copy-link behavior.
- Size edit decision.
- Theme/dark mode if retained.

---

### 3.4 Board — `/board`

**Current pattern**

- Content to the right of the sidebar.
- Board/Backlog toggle at top right.
- Search, All/Mine, Filters.
- Four lane columns: Todo, In Progress, In Review, Done.
- Cards with ID, title, status/blocked, priority, size, assignee.
- Expand control.

**Target adaptation**

- Remove the global sidebar; keep the dark A navbar.
- Keep the board canvas and lane behavior. Do not turn it into a table.
- Add a conventional page heading and use the A toolbar vocabulary where possible.
- Board may need full width rather than the 1320px index container. Use `container-fluid px-3 px-lg-4` if the lane canvas requires it, with the page header aligned to the same horizontal edge. **UNRESOLVED** until the board is measured.
- Keep Board/Backlog, search, All/Mine, Filters, expand.
- Preserve drag/drop and card interactions.
- Retire only sidebar/pane chrome.

**Approved principles**

- One navigation layer.
- Standard Bootstrap controls.
- No new card/token system.
- Content-first board canvas; no decorative shell.

**Dependencies**

- Board drag/drop.
- URL state for Board/Backlog.
- Responsive lane scrolling.
- Column virtualization, if any.

---

### 3.5 Matrix — `/matrix`

**Current pattern**

- Content to the right of the sidebar.
- Heading Matrix + count.
- Search, All/Mine, Filters, Rating Guide.
- Impact/Urgency 4×4 matrix with issue links and counts.
- Sidebar destination.

**Target adaptation**

- Remove sidebar; keep dark navbar.
- Use a `container-xl` content page if the matrix fits, or full-width if the grid needs more room. **UNRESOLVED**, based on measured grid width.
- Keep the matrix cells, rating guide, counts, search, filters.
- Keep issue links opening the dedicated detail route.
- Use Bootstrap table/border styling consistent with A; do not introduce a new matrix design.

**Preserve**

- Impact/urgency rating model.
- Not-assessed rows/columns.
- Rating guide.
- Filters and search.

**Dependencies**

- Matrix rating semantics.
- Rating guide modal or route.
- Permissions.

---

### 3.6 Plan — `/plan`

**Current pattern**

- Full content width to the right of the sidebar.
- Week/Cycle/Milestones/Day tabs.
- Week heading, date navigation, Schedule Issue button.
- Capacity bars per assignee; scheduled issue rows; Unassigned/Unestimated states.

**Target adaptation**

- Remove sidebar; dark A navbar.
- Keep plan canvas; use full width if required.
- Replace A’s single toolbar pattern with the plan’s existing view tabs and navigation, but keep one primary header row.
- Keep Schedule Issue as primary action.
- Keep capacity bars, rows, unassigned/unestimated states.
- Standardize buttons, selects, and links to Bootstrap/A.

**Preserve**

- Week/Cycle/Milestones/Day modes.
- Date navigation.
- Scheduling.
- Capacity calculations and labels.
- Unassigned/unestimated summaries.

**Dependencies**

- Planning model and capacity calculations.
- Date/time localization (already a production issue).
- Permissions.
- Cycle/milestone data.

---

### 3.7 Timeline — `/timeline`

**Current pattern**

- Full content width to the right of the sidebar.
- Heading Timeline + open count.
- Explanation of bars/fill/ticks.
- Repository select, Milestones button.
- Milestone row with date axis and bars.
- Legend.

**Target adaptation**

- Remove sidebar; dark A navbar.
- Keep timeline canvas.
- Use A page heading and breadcrumb/description conventions.
- Repository scope can remain in the page toolbar here if the timeline needs a local repository selector; it is currently in the page. The A navbar scope and timeline repo selector should not conflict. **UNRESOLVED** whether to use the global scope or the local selector.
- Keep Milestones action, legend, date axis.

**Preserve**

- Milestone timeline and bar semantics.
- Repository scope.
- Open/closed work legend.
- Milestone navigation.

**Dependencies**

- Milestone data.
- Repository scope consistency.
- Date/time localization.

---

### 3.8 Epics — `/epics` and 3.9 Milestones — `/milestones`

No production screenshots were provided.

**Target adaptation**

- Remove the global sidebar.
- Apply A shell principles: dark navbar, one page header, one toolbar row, Bootstrap tables/cards/forms, standard links.
- Preserve the existing list/detail or index behavior.
- If a detail view exists, use the A pattern: dedicated route or clearly separated page, not a split pane unless the current feature proves it needs one.
- Do not invent a composition beyond what the existing view requires.

**Unresolved**

- Index vs detail composition.
- Empty/loading/error states.
- Relationship to Issues/Milestones navigation.

---

### 3.10 Settings — `/settings/*`

**Current pattern**

- Global sidebar plus a local settings subnavigation column.
- Settings subnav groups:
  - Personal: Account, Appearance, Features, Availability.
  - Workspace: Repositories, Projects, Intake, Board, Planning, Notifications.
  - System: People, GitHub App, Sync, Session.
- Content area with section heading, description, form fields, help text.
- Planning screenshot shows a single content column with form sections.

**Target adaptation**

- Remove the global sidebar.
- Keep the settings subnavigation as a local page column. A legitimate local settings nav is not a global sidebar.
- Use a `container-xl` page: local settings nav in a left column, settings content in the right column, stacking on mobile.
- Keep the dark A navbar.
- Keep section headings, descriptions, form controls, help text, save behavior.
- Use Bootstrap nav/list-group for the local settings nav, not custom rail styling.

**Preserve**

- All settings routes and fields.
- Validation, dirty/saved state, destructive actions.
- Permissions.
- Personal/workspace/system grouping.

**Retire / change**

- Global sidebar from settings.
- The old global-sidebar padding/width that currently offsets the settings content.

**Dependencies**

- Settings routing and permissions.
- Local nav active state.
- Form persistence.
- Theme settings if dark mode is retained.

---

### 3.11 Public intake — `/intake` or public form

**Current pattern**

- Standalone centered form with funnel wordmark.
- Title/Description/Source; Copy Draft Link; Submit Issue.
- No app navbar or sidebar.

**Target**

- Preserve the standalone public shell. Do not add the authenticated app navbar.
- If touched, align typography and controls to Bootstrap/A:
  - Bootstrap form labels, inputs, selects.
  - Primary submit button.
  - Secondary copy-draft link.
  - 24–32rem form measure.
- Keep the current validation, draft link, source, and submit behavior.

**Unresolved**

- Whether the public intake form is in scope for this migration at all. It is not shown in the A PoC.

---

### 3.12 Uncaptured routes

Routes not shown in the nine screenshots — onboarding, authentication, error pages, individual notification/attention views, or any admin routes — are out of scope for detailed composition. Apply the A shell principles only if they are part of the authenticated app shell:

- dark navbar, no global sidebar;
- centered page container;
- standard Bootstrap controls and blue links;
- no new visual system.

Do not infer a detailed design from the PoC when no route evidence exists.

## 4. Shared component map

| Current component (functional name) | Current pattern | Target | Reuse | Retire / change | Notes |
| --- | --- | --- | --- | --- | --- |
| App shell / layout | Navbar + 232px sidebar + content | Navbar + page container | Navbar brand, user menu | Sidebar wrapper, sidebar offset | No global sidebar |
| Global navbar | Brand, repo, search, bell, theme, user | Same controls + primary nav links | Existing menus/controls | Add nav links, collapse | One layer; overflow unresolved |
| Sidebar navigation | Grouped destinations | Removed | Destination definitions | Sidebar markup, offcanvas, width CSS | Redistribute destinations |
| Repository scope | Navbar dropdown | Navbar dropdown | Existing scope state | Position/styling | Shared with index/inbox |
| Global search | Navbar search / modal or palette | Navbar button + inline Collapse panel | Search backend/results | Presentation if modal | A uses panel |
| Issue list pane | 360–460px split list | Full-width grouped table | Row metadata, filters | Pane width, scroll, split wrapper | A table |
| Issue row | List item with ID/title/meta | Table row with title link + row click | Issue data | Pane-specific selected state | Add focus + real link |
| Issue detail pane | Right pane | Dedicated page | Document, timeline, metadata API | Pane, close X, pills | 8/4 page |
| Metadata pills | Status/priority/size/assignee/milestone dropdowns | Properties card selects | Update API, value lists | Pill row | Size edit unresolved |
| Filters | Two toolbar rows | One row + More for extras | Filter state | Second row | All/Mine mapping unresolved |
| Grouping | Group dropdown and group headers | Same, in one toolbar | Group logic | Pane headers | Group headers non-collapsible |
| Inbox split | List + triage pane | Table + inline actions | Triage API | Detail pane | Conventional table |
| Comment composer | Textarea + button | Same | Markdown/renderer | Pane positioning | Cmd/Ctrl+Enter |
| Activity timeline | Events/comments | Same | Event/comment data | Pane borders | A separators |
| Empty states | Text in empty pane | Inline state in page | Copy/treatment | Empty pane | Approved A states |
| Loading/error | Existing app patterns | Preserve; page-level | Existing components | — | Not in A PoC |
| Pagination | Unknown | Preserve if present | Existing | — | A does not define |
| Toasts/notifications | Existing | Preserve | Existing | — | Not in A PoC |
| Board/Matrix/Plan/Timeline | View-specific canvases | Same canvases, A shell | Entire view internals | Global sidebar offset | Do not redesign views |
| Settings subnav | Local column inside global sidebar | Local page column | Section routes | Global sidebar offset | Keep local nav |

## 5. Styling and CSS migration

### Remove or replace

- 232px global sidebar width and border.
- Sidebar off-canvas width and `xl` breakpoint behavior.
- Split-pane list widths (`clamp(...)`, fixed 340/360/460 equivalents).
- Independent list/detail scroll containers.
- Mobile `detail-open` pane switching.
- Selected list item background/inset border used by the split list.
- Pane-level empty-detail messages.
- Any grid template or flex geometry that reserves list/detail columns.
- Sidebar-specific nav link, heading, count, and separator styles.

### Keep

- Bootstrap default colors, typography, spacing, borders, and form controls.
- Document line-height 1.65 if the production document uses the same body rendering; A’s `.issue-document` is the reference.
- Row pointer cursor.
- A visible focus treatment for rows (new production requirement; not in PoC).
- A document layout that respects the 8/4 grid.
- Real table semantics.

### Add

- Page containers (`container-xl`/`container-lg` or their production equivalents).
- Grouped table styling using Bootstrap `table`, `table-light`, `align-middle`, `hover`.
- Properties/Details cards using Bootstrap `card`.
- One-row toolbar using Bootstrap grid.
- Responsive table column classes.
- Navbar collapse at `lg`.
- Local settings layout inside the page.

### Do not add

- A new color or spacing token system.
- A custom card/table/nav wrapper layer.
- A replacement component library.
- A second global navigation surface.

## 6. Responsive migration

| Area | Current | Target A |
| --- | --- | --- |
| Global navigation breakpoint | Sidebar off-canvas below `xl` (1200) | Navbar collapse below `lg` (992) |
| Issues list/detail | Two panes until mobile switch | One table page; detail is a page |
| Issue table | Custom list metadata | Hide columns at `md`/`lg`, show metadata under title |
| Detail | Right pane | 8/4 at ≥992, stacked below |
| Inbox | Split panes | Table; hide columns at `md`/`lg` |
| Board | Content right of sidebar | Full-width canvas if needed; horizontal lane scroll |
| Matrix | Content right of sidebar | Container or full width pending measurement |
| Plan | Content right of sidebar | Full-width canvas if needed |
| Timeline | Content right of sidebar | Full-width canvas if needed |
| Settings | Global sidebar + local subnav | Page container + local subnav; stack on mobile |
| Search | Existing global control | Inline panel below navbar |

Specific checks:

- 992px: navbar expands in A. Verify the production primary set fits; if not, move items to More.
- 992px: detail is still 8/4 at 960px container; document 616px, card 296px. Test before shipping.
- 1024px: same 8/4 with 992px effective? Container remains 960 until 1200. Test.
- 1200px: container 1140; document 736; card 356.
- 1440px: container 1320; document 856; card 416.
- 390px: no horizontal page overflow; table uses metadata line; navbar collapsed.
- Board/Matrix/Plan horizontal scrolling: if the canvas needs horizontal scroll, contain it in the view, not the page body.

## 7. Keyboard and accessibility migration

Preserve current production behavior where it exists. In addition:

- Navbar toggler: button, `aria-expanded`, logical focus order, Esc behavior if the existing menu uses it.
- Active nav: `aria-current="page"`.
- Issue rows: real title link, row click, visible `:focus-visible`, Enter activation, focus restoration after back.
- Group headers: announce group context; do not make them focusable data rows.
- Filters: labels/`aria-label` for every select.
- Search: Ctrl/Cmd+K, autofocus, Enter first result, Esc close, focus return to trigger.
- Properties: labels associated with selects; immediate update announced via existing live-region/toast if available.
- Comments: Cmd/Ctrl+Enter; focus remains after submit.
- Triage: Accept/Decline accessible names; confirmation if destructive policy requires it.
- Touch targets: A’s small buttons are 31px high. If production targets mobile, verify against the platform’s touch guidance; increase hit area without changing the visual hierarchy if needed.
- Color: status/priority use icon + text, not color alone.

## 8. Dependencies on other workstreams

- **Routing:** dedicated issue detail route; preserve deep links and redirects.
- **Global navigation:** final primary/overflow/settings placement; notification and count treatment.
- **Search:** backend scope, ranking, permissions, and whether to keep the A inline panel.
- **Repository scope:** shared state across navbar, index, inbox, timeline.
- **Filters:** All/Mine, Open/status, saved views mapping into one toolbar.
- **Data:** pending-submission count, inbox count, issue counts, notification counts.
- **Permissions:** read-only issues, edit controls, triage actions, settings.
- **Settings:** local subnav inside the page; all sections and save behavior.
- **Board:** drag/drop, lanes, Backlog mode.
- **Matrix:** rating guide and matrix calculations.
- **Plan:** capacity, scheduling, date navigation.
- **Timeline:** milestone bars and repo scope.
- **Theme:** preserve the theme control; dark-theme composition undefined.
- **Loading/error:** page-level loading and error treatment; not in A PoC.
- **Analytics:** route changes, issue open/back, filter/group usage, triage actions.
- **Intake:** public form remains standalone.

## 9. Suggested workstream order

This is dependency ordering, not an implementation plan.

1. **Shell and navigation:** dark navbar, collapse behavior, destination redistribution, remove global sidebar, preserve global controls.
2. **Issues index:** container, one-row toolbar, grouped table, responsive columns, row links.
3. **Issue detail route:** dedicated page, 8/4 document, Properties/Details cards, activity, comments.
4. **Inbox:** table, inline triage, counts, responsive rows.
5. **Settings:** remove global sidebar, keep local subnav inside the page.
6. **Board/Matrix/Plan/Timeline:** remove global sidebar offset, align page headers and controls, preserve canvases.
7. **Epics/Milestones and uncaptured routes:** apply A principles where evidence exists.
8. **Cleanup:** retire split-pane/sidebar CSS, update tests, screenshot suites, documentation.

Do not begin production implementation until the unresolved navigation and state decisions are confirmed. **Stop after this handoff.**

## 10. Acceptance checklist

- [ ] No persistent global sidebar on Issues, Inbox, issue detail, Board, Matrix, Plan, Timeline, Epics, Milestones, or Settings.
- [ ] Dark global navbar is the only global navigation layer.
- [ ] Primary destinations fit in one navbar row at 992px; overflow is in a More menu.
- [ ] Active destination exposes `aria-current="page"`.
- [ ] Navbar collapses below `lg`; no global off-canvas drawer.
- [ ] Issues uses one page container and one toolbar row.
- [ ] Issues is a grouped six-column table, not a split list/detail.
- [ ] Issue rows have real title links and visible keyboard focus.
- [ ] Issue detail is a dedicated route, not a pane.
- [ ] Detail uses 8/4 layout at `lg` and above.
- [ ] Properties card edits status, priority, assignee, milestone; size decision resolved.
- [ ] Details card shows repo, epic, size, labels, opened, updated.
- [ ] Activity and comments remain below the document.
- [ ] Inbox is a table with inline Accept/Decline, not a split pane.
- [ ] Inbox and issue counts are live.
- [ ] Mobile 390px has no horizontal page overflow.
- [ ] Detail mobile order of metadata is decided.
- [ ] Loading, error, permission, and read-only states are defined.
- [ ] Settings keeps its local subnav inside the page.
- [ ] Board/Matrix/Plan/Timeline preserve their view-specific behavior.
- [ ] Public intake remains standalone.
- [ ] No custom design-token layer or replacement component library was introduced.
- [ ] Split-pane, sidebar, and detail-pane CSS are retired.

## 11. Open decisions for the architect and product owner

1. Final primary navigation set and More overflow contents.
2. Placement of My Issues, Notifications, Attention, Epics, Milestones, Settings, and Inbox count.
3. All/Mine and saved-view treatment in the one-row toolbar.
4. Size editing in Properties.
5. Mobile order of Properties/Details relative to activity.
6. Decline confirmation, bulk triage, and bulk actions.
7. Loading, error, permission, and read-only states.
8. Dark theme scope and palette derivation.
9. Pagination or result limits.
10. Document measure: retain 856px at 1440 or narrow through product decision.
11. Touch target sizing for small buttons on mobile.
12. Date/time localization and relative date policy.
13. Search backend, ranking, and permission semantics.
14. Create-issue entry point.
15. Board/Matrix/Plan/Timeline full-width vs container treatment.
16. Settings local navigation composition.
17. Epics/Milestones/uncaptured route composition.

## 12. Evidence index

### Approved A screenshots

- [Desktop index](../../poc/compositions/screenshots/desktop-a-issues.png)
- [Desktop detail](../../poc/compositions/screenshots/desktop-a-issue.png)
- [Desktop activity](../../poc/compositions/screenshots/desktop-a-activity.png)
- [Desktop inbox](../../poc/compositions/screenshots/desktop-a-inbox.png)
- [Mobile issues](../../poc/compositions/screenshots/mobile-a-issues.png)
- [Mobile detail](../../poc/compositions/screenshots/mobile-a-issue.png)
- [Mobile inbox](../../poc/compositions/screenshots/mobile-a-inbox.png)

### Current production screenshots

- [Inbox](../../screenshots/inbox-light.png)
- [Issues](../../screenshots/issues-light.png)
- [Issue detail](../../screenshots/issue-light.png)
- [Board](../../screenshots/board-light.png)
- [Matrix](../../screenshots/matrix-light.png)
- [Plan](../../screenshots/plan-light.png)
- [Timeline](../../screenshots/timeline-light.png)
- [Settings / Planning](../../screenshots/settings-planning-light.png)
- [Intake](../../screenshots/intake-light.png)

### PoC source and tests

- [Composition A source](../../poc/compositions/src/variants/a/TraditionalApp.svelte)
- [Composition A specification](./COMPOSITION-A.md)
- [Comparison and selection record](../../poc/compositions/COMPARISON.md)
- [Shared issue body](../../poc/compositions/src/lib/IssueBody.svelte)
- [Shared timeline](../../poc/compositions/src/lib/IssueTimeline.svelte)
- [Shared search panel](../../poc/compositions/src/lib/SearchPalette.svelte)
- [Layout CSS](../../poc/compositions/src/styles/app.css)
- [Playwright tests](../../poc/compositions/tests/lab.spec.js)
