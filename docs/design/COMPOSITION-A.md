# Composition A — Traditional Bootstrap Application

**Status:** Approved design specification  
**Approved:** 2026-11-03  
**Authority:** This document is the implementation source of truth for Composition A. If it conflicts with a screenshot, the screenshot and the PoC source are evidence; if it conflicts with `MIGRATION-MAP.md`, this document governs the design and the migration map governs current-to-target mapping.

Composition A was selected by product preference after the three-composition study. The analytical comparison remains in [`COMPARISON.md`](../../poc/compositions/COMPARISON.md): C scored highest on the study criteria, A was selected for its conventional application shell, widest title column, dedicated document page, and Properties card. The selection does not reopen the comparison.

## Evidence base and limits

The specification is derived from:

- The approved PoC: [`poc/compositions/src/variants/a/TraditionalApp.svelte`](../../poc/compositions/src/variants/a/TraditionalApp.svelte).
- Shared PoC content and behavior: [`IssueBody.svelte`](../../poc/compositions/src/lib/IssueBody.svelte), [`IssueTimeline.svelte`](../../poc/compositions/src/lib/IssueTimeline.svelte), [`SearchPalette.svelte`](../../poc/compositions/src/lib/SearchPalette.svelte), [`fixtures.js`](../../poc/compositions/src/lib/fixtures.js), [`issueModel.js`](../../poc/compositions/src/lib/issueModel.js).
- Layout CSS: [`app.css`](../../poc/compositions/src/styles/app.css).
- Composition A screenshots in [`poc/compositions/screenshots/`](../../poc/compositions/screenshots/).
- The comparison record and the original production screenshots in [`screenshots/`](../../screenshots/).

The current production source tree was not present in the accessible workspace. The migration map is therefore grounded in the nine supplied production screenshots and the visible production behavior. Component names in `MIGRATION-MAP.md` are functional descriptions, not claims about production file names.

## How to read this document

- **APPROVED** — preserve this decision. Changing it is a product/design change, not an implementation choice.
- **EXAMPLE** — an implementation example from the PoC. It may be adapted without changing the approved composition.
- **UNRESOLVED** — a product or accessibility decision not settled by the PoC. The architect must resolve it with product/design; do not present a guess as approved.

---

## 1. Design intent

Composition A is a conventional Bootstrap issue tracker:

- One global navigation layer.
- A centered issue index, grouped by status.
- A dedicated issue document on its own page.
- A right-hand Properties card for editing.
- A conventional inbox table for triage.
- Standard Bootstrap tables, forms, buttons, cards, breadcrumbs, and blue links.

It is not a dashboard shell. It deliberately removes the persistent sidebar and the split list/detail pane. The page is the unit of composition: index page, document page, inbox page. **APPROVED**

The design reference is the WARC Specifications reading experience as interpreted through Bootstrap: quiet chrome, blue links, conventional type, and content that is not wrapped in decorative containers. A is the closest of the three compositions to that reference.

## 2. Page architecture

### 2.1 Shell

Every app route renders:

1. A dark global navbar, 56px measured height in the PoC, in normal document flow. The navbar is not sticky in the PoC.
2. A page `<main>` with `py-4` (24px vertical padding).
3. No global sidebar and no fixed list/detail columns. **APPROVED**

The content region uses the normal document scroll. Only the page itself scrolls; there are no nested app panes in A.

### 2.2 Containers and measured widths

The PoC uses:

- Issue index and Inbox: `<main class="container-xl py-4">`.
- Issue detail: `<main class="container-lg py-4">`.

Both `container-xl` and `container-lg` resolve to the same effective max-width at every Bootstrap breakpoint because Bootstrap applies the same max-width rules to both classes at `lg`, `xl`, and `xxl`. The class-name difference is an implementation example, not a visible design decision. **EXAMPLE**

Measured effective content widths:

| Viewport | Container width | Container x-offset | Notes |
| ---: | ---: | ---: | --- |
| 390px | 390px | 0 | 12px horizontal padding |
| 576px | 540px | 18px | `sm` |
| 768px | 720px | 24px | `md` |
| 992px | 960px | 16px | `lg` |
| 1200px | 1140px | 30px | `xl` |
| 1400px | 1320px | 40px | `xxl` |
| 1440px | 1320px | 60px | measured PoC |
| 1920px | 1320px | 300px | large centered gutters |

At 1440px:

- Issue index and Inbox main width: 1320px.
- Table width: 1294px after container padding and table border.
- Detail: 1320px main width, 880px document column, 440px properties column, 856px rendered document, 416px rendered card.
- The PoC document column has no additional `72ch` cap. It is governed by `col-lg-8`. **APPROVED**

The centered 1320px maximum is an approved A characteristic. It produces large side gutters on ultrawide displays. Do not silently change it to a full-bleed layout; that would be a composition change. If ultrawide behavior is revisited, it is a product decision. **UNRESOLVED** only for ultrawide displays beyond the PoC.

### 2.3 Vertical rhythm

- Navbar: 56px measured, `py-2`.
- Page main: `py-4` = 24px top and bottom.
- Breadcrumb: `Breadcrumb class="mb-2"`; 16px type, 8px bottom margin.
- Page heading: `h3` = 28px / 33.6px line-height at 1440px.
- Page heading bottom margin: `mb-1` = 4px.
- Page description: default body text, `text-body-secondary`, `mb-0`; header block bottom margin `mb-3` = 16px.
- Toolbar: `row g-2` = 8px gutters; `mb-3` = 16px below.
- Table: 41px issue rows, 41px group-header rows, default Bootstrap table cell padding.
- Detail: `row g-4` = 24px gutters; breadcrumb `mb-2`; title `mb-2`; meta line then `mt-2` block.
- Properties card: default 16px `.card-body` padding; fields spaced with `mb-3`.
- Activity: `mt-4 pt-4 border-top` = 24px separation above and below the rule.

All spacing uses Bootstrap’s spacing scale. No custom spacing tokens. **APPROVED**

## 3. Global navbar

### 3.1 Desktop composition

The PoC uses a Sveltestrap `Navbar` with `dark`, `color="dark"`, `expand="lg"`, and `py-2`. **APPROVED**

Left to right:

1. Brand: `funnel`, lowercase, `fw-semibold`, Bootstrap `.navbar-brand` size 20px.
2. Vertical divider: `vr d-none d-lg-block opacity-25 mx-1`.
3. Primary navigation: Inbox, Issues, Board, Matrix, Plan, Timeline.
4. Repository scope dropdown: folder icon + “All repositories” or the selected repository.
5. Search button: search icon + “Search” + a compact `Ctrl K` hint.
6. User dropdown: person-circle icon + “Torben Haack”.
7. PoC menu items: Profile, Preferences, Sign out.

The navbar is dark (`bg-dark`, dark Bootstrap theme variables). Inactive links render at roughly 55% white; the active link renders white. Active destinations use Sveltestrap `NavLink active`. **APPROVED**

### 3.2 Navigation behavior

- Clicking a primary destination changes the hash route.
- The active destination is visually distinct and should expose `aria-current="page"` in production. The PoC uses Bootstrap’s active class. **APPROVED**
- Nav links close the collapsed mobile menu when clicked. **APPROVED**
- Search opens the search panel and closes the collapsed menu. **APPROVED**
- Repository scope is shared with the index/inbox filters. Selecting a repository changes the visible content. **APPROVED**
- The user menu is a standard Sveltestrap `Dropdown` with `DropdownMenu end`. **EXAMPLE**

### 3.3 Responsive navigation

Below `lg` (992px), the navbar collapses:

- A `NavbarToggler` with a Bootstrap Icons `bi-list` glyph replaces the inline navigation.
- A Sveltestrap `Collapse navbar expand="lg"` contains the nav and right-side controls.
- The menu expands in document flow; it is not an off-canvas drawer.
- The toggler exposes `aria-expanded`; mobile focus order follows brand → toggler → expanded links → repo → search → user.
- The search panel opens below the navbar and pushes content down.

This is a deliberate difference from the production sidebar/off-canvas model. A does **not** use a sidebar off-canvas. **APPROVED**

### 3.4 Production navigation overflow

The PoC demonstrates six primary destinations. The production application currently exposes more:

Inbox, My Issues, Notifications, Attention, Issues, Board, Matrix, Plan, Epics, Milestones, Timeline, Settings, plus the global search, notification bell, theme control, and user menu.

A must remain one navigation layer. The exact production primary set, overflow menu, notification placement, and settings placement are not settled by the PoC. **UNRESOLVED**

Constraints for resolving it:

- Do not reintroduce a persistent global sidebar.
- Keep at most six visible text destinations in the navbar at desktop width; use a More dropdown for additional destinations.
- Keep the existing notification bell and theme control as navbar icon controls if they remain in the product.
- Keep Settings reachable from the user menu or More; do not create a second global navigation rail.
- Preserve all existing destination URLs.
- Define the overflow treatment before implementation; do not let the navbar wrap or create a second row.

`MIGRATION-MAP.md` proposes a coverage pattern and lists the destinations that need a decision.

### 3.5 Theme

The A PoC is light-theme only. The root document uses `data-bs-theme="light"`, and the navbar uses its own dark Bootstrap theme context. There is no dark-theme design for the page content in A. **APPROVED for the light baseline; UNRESOLVED for dark theme.**

Production currently exposes a theme control. Preserve the capability, but do not invent a new palette. If dark mode is retained, derive it from Bootstrap theme variables and validate the same compositions separately.

## 4. Typography and information density

Composition A uses the Bootstrap system font stack. No custom typeface is introduced.

Measured PoC values at 1440px:

| Element | Size / treatment |
| --- | --- |
| Page heading (`h3`) | 28px / 33.6px, default weight |
| Detail title (`h3`) | 28px / 33.6px |
| Body / table base | 16px |
| Document body | 16px / 26.4px line-height (1.65) |
| Breadcrumb | 16px |
| Navbar links | 16px |
| Navbar brand | 20px |
| Table cell metadata / group headings | 14px (`.small`) |
| Nested `.small` inside a small table cell | 12.25px in some cells; use the intent, not this accident |
| Buttons (`size="sm"`) | 14px / 31px height |
| Form labels | 14px |
| Property selects | 16px / 38px height in the PoC |
| Badges | Bootstrap badge scale, `.75em` |

Typography rules:

- IDs use `.font-monospace`; titles are not monospaced.
- Links use Bootstrap’s default blue link color. List titles use `text-primary` with no underline; conventional browser hover behavior applies.
- Status and priority are text + Bootstrap Icons, not colored pills in the index.
- Labels use `Badge color="light" class="border fw-normal text-body-secondary"`.
- Issue body headings map to Bootstrap: `h2` → `.h5 mt-4 mb-2`, `h3` → `.h6 mt-4 mb-2`.
- Issue body paragraphs use `mb-3`; lists use `ps-4 mb-3` with `li mb-1`.
- Code blocks use `pre.bg-body-tertiary.border.rounded.p-3.small.overflow-auto.mb-3` with a nested `code`.
- Blockquotes use a 3px start border and secondary text.

The A document column is wide: 856px at 1440px, roughly 100+ characters per line for normal prose. That is the approved A composition; it is not a 72ch reading measure. Do not silently apply B/C’s measure. If readability testing requires a narrower document column, that is a product decision. **APPROVED layout; UNRESOLVED readability adjustment.**

## 5. Color, theme, and surfaces

Composition A uses Bootstrap defaults only. There are no custom color tokens, no brand palette, and no color overrides. **APPROVED**

- Root theme: `data-bs-theme="light"`.
- Navbar: dark Bootstrap theme, `bg-dark`.
- Body: default white `--bs-body-bg`.
- Secondary text: `text-body-secondary`.
- Tertiary metadata: `text-body-tertiary` in a few separators.
- Borders: Bootstrap `--bs-border-color`; tables wrapped in `border rounded`.
- Table headers and group rows: `table-light`.
- Cards: Bootstrap `Card` with default border and radius; no shadows.
- Page backgrounds: body only; no tinted main canvas.
- Status:
  - Backlog/Todo: `text-secondary` with `bi-circle`.
  - In progress: `text-primary` with `bi-circle-half`.
  - In review: `text-warning` with `bi-eye`.
  - Done: `text-success` with `bi-check-circle`.
- Priority:
  - P1 High: `text-danger`.
  - P2 Medium: `text-body`.
  - P3 Low: `text-secondary`.
- Labels: light badge with border and secondary text.
- Buttons: primary blue for the main action; outline-secondary for secondary actions; link buttons for clear/close actions.
- Alerts: light bordered alert for neutral information; success alert for an empty inbox.

No decorative gradients, shadows, tint blocks, or custom surface tokens. **APPROVED**

## 6. Tables, links, controls, and surfaces

### 6.1 Tables

- Use Sveltestrap `Table` with `hover` and `align-middle`; `mb-0` inside a bordered wrapper.
- The index and inbox use `<div class="table-responsive border rounded">`.
- Headers use `<thead class="table-light">`.
- Group headers use a full-width `tr.table-light` with `th colspan="6"` for the issue index.
- Issue rows are 41px at 1440px with normal content. Long titles wrap naturally; there is no fixed row height.
- The title column is not a fixed width; it takes the remaining space.
- Index column width hints: Issue 7rem, Status 8rem, Priority 7rem, Assignee 10rem, Updated 8rem. Title fills the remainder.
- Inbox columns: Issue, Title, Repository, Source, Submitted, Triage. Actions stay right-aligned and nowrap.

### 6.2 Links

- Index titles use `text-primary` and no underline.
- Inbox titles are real links with `text-decoration-none`; production should use real links for keyboard and middle-click.
- Breadcrumb links use Bootstrap default.
- “Open in GitHub” is a bordered secondary button with `bi-box-arrow-up-right`.
- Do not turn the entire table into a card grid.

### 6.3 Buttons

- Primary: `Button color="primary" size="sm"` (Accept, Comment).
- Secondary: `Button color="outline-secondary" size="sm"` (Decline, Open in GitHub, Clear filters).
- Quiet: `Button color="link" size="sm" class="text-decoration-none"` (clear filters, close search).
- Destructive actions are not visually styled as destructive in A; Decline is secondary outline. Preserve composition; production may add confirmation. **UNRESOLVED for destructive semantics.**

### 6.4 Forms

- Index filters: Sveltestrap `Input type="select" bsSize="sm"` inside toolbar columns.
- Search: `InputGroup size="sm"` + `InputGroupText` search icon + `Input type="search"`.
- Detail properties: standard Sveltestrap `Input type="select" bsSize="sm"` with a visible `<label class="form-label small">` above each.
- The PoC selects render at 38px / 16px because Sveltestrap applies `form-control-sm` to selects rather than `form-select-sm`. Preserve the visual density, not the prop assumption. **EXAMPLE**
- Inbox/issue search inputs are 31px high in the small input group.
- Comment composer: `Input type="textarea" rows="3"`; labels above.

### 6.5 Cards

- Detail Properties and Details use Sveltestrap `Card` + `CardBody`.
- Cards use default Bootstrap border/radius; no shadow.
- Properties card at 1440px: 416px wide, 16px body padding.
- Details card uses `<dl class="row small">` with a 5/7 column split.

### 6.6 Badges and labels

- Status is not a badge in A; it is icon + text.
- Priority is text.
- Labels are light bordered badges.
- Group counts are plain secondary text.

## 7. Issue index

Route: the PoC uses `#/a/issues`; production target is `/issues`. **APPROVED composition; route is production mapping.**

### 7.1 Default state

- Breadcrumb: “Workspace / Issues”.
- Page heading: `Issues` + visible count in a muted `fs-6` span.
- Description: “Every open issue in the current scope, grouped for scanning.”
- A “Clear N active filters” link appears only when a filter or search is active.
- One toolbar row.
- Grouped table below.
- Footer: “Showing N issues” and the repo scope if one is selected.
- Default grouping: status.
- Default state shows 12 fully visible issue rows at 1440×900; 16 issues exist across five status groups, but group headers consume vertical space.

### 7.2 Toolbar and filters

One row, no second toolbar row:

- Search: `col-12 col-lg-4`; title/body/ID placeholder.
- Status: `col-6 col-lg-2`.
- Priority: `col-6 col-lg-2`.
- Assignee: `col-6 col-lg-2`.
- Group: `col-6 col-lg-2`.

Repository scope lives in the navbar, not the toolbar. The toolbar is 8px-gutter Bootstrap grid. On narrow screens it wraps into two columns of selects with a full-width search field.

Filter semantics in the PoC:

- Repository (navbar): all repositories or one of `funnel`, `assay`, `forges.link`, `intake`.
- Status: All or one status.
- Priority: All or one priority.
- Assignment: Anyone, one person, or Unassigned.
- Group: Status, Priority, Assignee, or Nothing.
- Clear filters resets filters and search.

Milestone filtering, saved views, and an “All/Mine” toggle are **not defined by A**. Production currently has All/Mine, a status control, and Filters. Preserve the functionality; map it into this single-row model without adding a second toolbar. **UNRESOLVED for exact control treatment.**

### 7.3 Grouping

- Default status order: Backlog, Todo, In progress, In review, Done.
- Priority order: P1 High, P2 Medium, P3 Low.
- Assignee order: people fixture order then Unassigned in the PoC. Production should use a stable product-defined order.
- Empty groups are omitted.
- Group header: 14px semibold secondary text + count, `table-light`, `colspan="6"`.
- “Nothing” renders a single “All issues” group.
- Grouping choice is visible in the toolbar.
- Group headers are not collapsible in A. Production should not add collapsed groups unless product asks; that would be a new interaction. **UNRESOLVED if existing production grouping is collapsible.**

### 7.4 Row anatomy

Each row, left to right:

1. Issue ID, monospace, 14px secondary, nowrap.
2. Title in blue, plus any labels as bordered light badges; mobile metadata line below the title.
3. Status: icon + text, color by status.
4. Priority: P1/P2/P3 label, color by priority.
5. Assignee full name, or “Unassigned”; hidden below `md`.
6. Updated relative time, right-aligned; hidden below `lg`.

On mobile below `md`, the ID, status, priority, and assignee move into a secondary line under the title; the ID column and status/priority/assignee columns are hidden. The table has no horizontal page overflow at 390px.

Row interaction:

- Entire row is a click target; cursor pointer.
- Row is focusable (`tabindex="0"`) and Enter navigates in the PoC.
- There is no persistent “selected row” state; selection opens the detail page.
- No action menu, hover menu, or inline edit in the index. **APPROVED unless production already has row actions; preserve them without turning the row into a toolbar.**

### 7.5 Empty state

Centered block inside a bordered `bg-body-tertiary` surface:

- Search icon.
- “No issues match this view” semibold.
- “Try a different search term, or clear the active filters.”
- `Clear filters` outline-secondary button.

This is an approved A state. Loading and error are not demonstrated; see §11.

## 8. Issue detail

Route: PoC `#/a/issues/:id`; production target `/issues/:id`. **APPROVED composition; route mapping in MIGRATION-MAP.**

### 8.1 Header

- Breadcrumb: “Issues / FUN-58”.
- Repository + issue ID line, folder icon, monospace ID.
- Title `h3`.
- Meta row: status icon/text, labels, “opened X by author”, “updated X”.
- “Open in GitHub” outline-secondary button on the right.
- If the issue is untriaged, a light bordered alert explains that it is still in Inbox and offers Accept / Decline.
- The header uses `d-flex flex-wrap align-items-start justify-content-between gap-3`.

### 8.2 Document layout

- `row g-4 mt-2`.
- Main column: `col-lg-8`.
- Side column: `col-lg-4`.
- At 1440px: 880px / 440px columns, 856px document, 416px card.
- At <992px: columns stack. The Properties and Details cards come after the document and activity in DOM order. See §12 and the unresolved mobile-order note.
- Document body is wrapped in `.issue-document`; 16px / 1.65 line-height.
- Activity and comments follow the document in the main column.

### 8.3 Properties card

Sections and order:

1. Status select.
2. Priority select.
3. Assignee select (includes Unassigned).
4. Milestone select (includes No milestone).

Behavior:

- Changing a value updates the issue immediately.
- An activity event is appended: “Torben Haack changed the status to In review · just now”.
- The detail header and index reflect the new value after navigation.
- There is no Save button and no unsaved state. **APPROVED for the PoC; verify production expectations.**
- Labels above controls are 14px; controls are standard Bootstrap selects.
- The card heading is “Properties” in `h6`.

### 8.4 Details card

A definition list with:

- Repository.
- Epic.
- Size.
- Labels (badges).
- Opened (relative + author).
- Updated (relative).

Labels are 14px; values wrap. This card is static metadata, not editable. **APPROVED**

### 8.5 Activity and comments

- Activity heading `h6` + comment count.
- System events: icon + actor + action + relative time; no card.
- Comments: person-circle icon, author, “commented X”, rich body.
- Comment body may include paragraphs, lists, code, etc. Reuse the issue body renderer.
- Composer: label “Add a comment”, 3-row textarea, “Markdown supported”, primary Comment button.
- Cmd/Ctrl+Enter submits; empty submission keeps focus in the textarea.
- New comment appends to the timeline and updates the issue’s updated label. **APPROVED**

### 8.6 Editing and state

- Selects commit immediately and produce activity events.
- The Properties card is the only metadata editor on the detail page.
- The status/priority labels in the header also update.
- The detail page is a normal route, so browser back returns to the index.
- No split-pane selection or unsaved pane state.

## 9. Inbox

Route: PoC `#/a/inbox`; production target `/inbox`.

### 9.1 Default state

- Breadcrumb: “Workspace / Inbox”.
- Heading: “Inbox” + “N untriaged issues · 0 pending submissions”.
- Search field on the right of the header; 18rem minimum width in the PoC, growing on smaller/medium layouts.
- Conventional table with columns: Issue, Title, Repository, Source, Submitted, Triage.
- Repository scope comes from the navbar.
- 4 untriaged issues in the fixture.
- The “0 pending submissions” count is a fixture constant in the PoC, not a live count. Production must source it from real data. **UNRESOLVED data wiring; no visual change.**

### 9.2 Triage presentation and behavior

- Accept: primary small button.
- Decline: outline-secondary small button.
- Accept marks the issue triaged, sets status to Backlog, and removes it from Inbox. It appears in the issue index.
- Decline marks the issue triaged and declined; it is removed from Inbox and does not appear in the normal index.
- Both update the Inbox count.
- The row title links to the issue detail page; the detail page shows the untriaged alert with Accept/Decline.
- No bulk selection, bulk triage, or confirmation is demonstrated. **UNRESOLVED for production bulk actions and destructive confirmation.**

### 9.3 Empty state

`Alert color="success" class="border"` with a check icon and “Inbox is clear. Nothing is waiting for triage.” **APPROVED**

### 9.4 Responsive inbox

- Below `md`: Issue column hidden; the ID moves above the title; Source/Submitted hidden; Repository hidden below `lg`; Triage buttons remain visible at the right.
- At 390px: title, repository/source metadata, and Accept/Decline fit without horizontal page overflow.
- The C composition’s stacked mobile cards are **not** part of A. A keeps the table layout.

## 10. Global search

The PoC search is a panel, not a modal:

- Navbar “Search” button, with `Ctrl K` hint.
- Ctrl/Cmd+K opens it.
- Panel appears below the navbar, full-width, `bg-body-tertiary`, bordered bottom.
- Heading “Search issues”, Close link, search input, result list.
- Default results: most recently updated eight issues across all repositories.
- Query searches title, ID, body, labels, people, source, submitter, and comments.
- Result row: ID, repository, title, status.
- Click opens the issue; Enter opens the first result; Esc closes.
- Search input is focused when the panel opens.
- Search panel is independent of the index’s inline search. In the PoC, index search state is separate.

Production search semantics, result ranking, permissions, and whether the panel uses the existing global search index are **UNRESOLVED**. Preserve A’s compact inline-panel presentation unless product requires the existing modal.

## 11. States

### Default

Documented in §§7–9.

### Active / selected

- Navbar: active destination uses Bootstrap active styling.
- Table: no persistent row selection; opening an issue navigates.
- Filters: active values remain visible in controls; “Clear N active filters” link appears.
- Inbox: no selected row; Accept/Decline act immediately.

### Editing

- Detail selects commit immediately; activity event appended.
- Comment composer has a draft in memory; submit appends; empty submit does not clear.
- No explicit inline edit mode in the index.

### Empty

- Issue index: bordered centered empty state with search icon, explanation, Clear filters.
- Inbox: success alert.
- Detail: invalid ID shows “This issue does not exist. Return to Issues.”
- Unassigned/missing values: “Unassigned”, “No milestone”, no labels.

### Loading

**Not demonstrated in the PoC. UNRESOLVED production requirement.**

Constraints:

- Keep the dark navbar and page header in place to avoid layout shift.
- Replace only the content region with the application’s existing loading treatment.
- If the application has no existing treatment, Sveltestrap `Spinner` or skeleton rows inside the existing table/card geometry are acceptable examples, not a new design system.
- Do not introduce a full-page spinner that removes navigation.

### Error

**Not demonstrated in the PoC. UNRESOLVED production requirement.**

Constraints:

- Keep the shell and page header.
- Show a Bootstrap `Alert` or the application’s existing error component in the content region.
- Provide retry/reload when the route can recover.
- Do not show raw server messages.

### Permission / read-only

**Not demonstrated. UNRESOLVED.**

- Preserve the document layout.
- Hide or disable metadata editing and comment composition when the user lacks permission.
- Do not replace the whole page with a permission empty state unless the user cannot read the issue at all.

### Partial / long content

- Long titles wrap; code blocks scroll inside the document.
- Long labels wrap as badges.
- No horizontal page overflow at 390px in the PoC.
- Timeline can grow arbitrarily; page scrolls normally.

## 12. Responsive behavior

Bootstrap breakpoints: `sm` 576, `md` 768, `lg` 992, `xl` 1200, `xxl` 1400.

| Region | < 576 | 576–767 | 768–991 | 992–1199 | 1200–1399 | ≥ 1400 |
| --- | --- | --- | --- | --- | --- | --- |
| Navbar | Collapsed | Collapsed | Collapsed | Expanded | Expanded | Expanded |
| Container | 100% | 540px | 720px | 960px | 1140px | 1320px |
| Index toolbar | 2-col selects, full-width search | 2-col | 2-col | One row | One row | One row |
| Index table | Title + mobile meta line | Title + meta | ID/title/status/priority/assignee | + updated | + updated | + updated |
| Detail | Stacked | Stacked | Stacked | 8/4 split | 8/4 split | 8/4 split |
| Inbox table | Title + ID/meta + actions | Title + meta | + source/submitted | + repository | + repository | + repository |

Measured mobile PoC: 390px viewport, no horizontal overflow on index, detail, or inbox. The mobile navbar is a collapsed Bootstrap `Collapse`, not an off-canvas drawer.

Detail stacking:

- At <992px, the document and properties columns stack vertically.
- DOM order is document/activity first, properties/details second. This means mobile users reach the Properties card after the document and activity. The PoC does not demonstrate a mobile metadata-first treatment. **UNRESOLVED**: decide whether to keep this order or place Properties before the activity on mobile. That is a UX change and requires product approval.

Tablet/laptop note:

- At 992px, detail is still 8/4: 616px document, 296px card. This is within the PoC but tight. Test at 992 and 1024.
- At 1200px, detail is 736px document, 356px card.
- At 1400px+, document is 856px, card 416px.

## 13. Keyboard accessibility

Demonstrated in the PoC:

- Navbar toggler is a button with `aria-expanded`.
- Nav links are normal links.
- Dropdowns and menus use Sveltestrap keyboard behavior.
- Search opens from Ctrl/Cmd+K; input auto-focuses; Enter opens the first result; Esc closes.
- Issue rows are focusable with `tabindex="0"` and Enter navigates.
- Inbox title links are real links.
- Selects and textareas are native controls.
- Comment Cmd/Ctrl+Enter submits.
- Buttons have accessible names.

Production requirements and gaps:

- Add a visible `:focus-visible` treatment to issue rows. The PoC relies on the browser default and does not define one.
- Replace the `role="button"` on `<tr>` as the sole affordance with a real title link plus row click. The row may remain clickable, but keyboard and middle-click must work through a link.
- Restore focus to the originating row or filter when returning from detail.
- Ensure group headers are announced as group context, not as data rows. Prefer a real table structure with header rows.
- Provide `aria-current="page"` on active navigation.
- Ensure the mobile navbar’s focus order is logical and Esc closes it if the product expects it.
- Small buttons are 31px high in the PoC. Touch target guidance may require a larger hit area without changing the visual size. **UNRESOLVED accessibility adjustment.**
- Do not use color alone for status/priority; A uses icon + text, which should be preserved.

## 14. Sveltestrap implementation map

| Need | Sveltestrap component / pattern | Notes |
| --- | --- | --- |
| Global navbar | `Navbar`, `NavbarBrand`, `NavbarToggler`, `Collapse`, `Nav`, `NavItem`, `NavLink` | `dark color="dark" expand="lg"`; Collapse `navbar expand="lg"` |
| Containers | Bootstrap container classes + native `<main>` | `container-xl py-4`, `container-lg py-4` |
| Breadcrumbs | `Breadcrumb`, `BreadcrumbItem` | `mb-2`; active item is the current issue |
| Index and inbox table | `Table` | `hover align-middle mb-0`; `thead.table-light`; `table-responsive border rounded` wrapper |
| Group headers | Native `<tr class="table-light">` | Keep table semantics; do not use cards |
| Buttons | `Button` | `color`, `size="sm"`, `outline`, `type="submit"` |
| Filters | `Input type="select"` | `aria-label` required; `value` + `on:change` |
| Search field | `InputGroup`, `InputGroupText`, `Input type="search"` | `size="sm"` |
| Repository / user menus | `Dropdown`, `DropdownToggle`, `DropdownMenu`, `DropdownItem` | `end` for right-aligned menus; `autoClose` where needed |
| Metadata editing | `Input type="select"` inside `Card`/`CardBody` | Immediate update + activity event |
| Cards | `Card`, `CardBody` | Default Bootstrap border/radius; no custom surface |
| Alerts | `Alert` | Light bordered alerts; success alert for empty inbox |
| Search results | `ListGroup`, `ListGroupItem` | `flush`; action/button items |
| Comment composer | `Input type="textarea"`, `Button` | Native textarea; Cmd/Ctrl+Enter |
| Badges | `Badge` | `color="light" class="border fw-normal text-body-secondary"` |
| Icons | Bootstrap Icons via `<i class="bi ...">` | No custom icon set |
| Navigation collapse | `Collapse` | Not an off-canvas drawer |

Do not introduce:

- A custom design-token layer.
- Wrapper components around Sveltestrap primitives.
- A replacement component library.
- Custom color/spacing scales.
- A new card or table abstraction whose only purpose is visual encapsulation.

Feature-level shared components such as an issue body renderer, activity timeline, or search panel are acceptable. They are not a design system.

## 15. Decision ledger

### Approved decisions — must be preserved

1. One dark global navbar; no persistent global sidebar in the app shell.
2. Centered page containers; 1320px maximum at ≥1400px for the index/detail/inbox.
3. Conventional blue links and Bootstrap system typography.
4. Grouped six-column issue index: ID, title, status, priority, assignee, updated.
5. One filter toolbar row; repo scope in the navbar.
6. Dedicated issue document page; no split list/detail pane.
7. 8/4 document and Properties/Details split at `lg` and above.
8. Properties card with status, priority, assignee, milestone selects; immediate commit.
9. Details card with repo, epic, size, labels, opened, updated.
10. Comments and activity below the document.
11. Conventional inbox table with inline Accept/Decline.
12. Bootstrap-default colors, borders, cards, no shadows.
13. Mobile navbar collapse and the column-hiding/metadata-line table behavior.
14. Search panel below the navbar with Ctrl/Cmd+K, Enter, Esc.
15. The documented empty states.

### Implementation examples — may be adapted

- `container-xl` vs `container-lg` class names, as long as the widths stay equivalent.
- Exact hash routes in the PoC; production uses the real route names.
- Sveltestrap `Input` sizing props; preserve rendered density, not the prop name.
- Inline column width hints (`7rem`, `8rem`, `10rem`).
- Shared feature components (`IssueBody`, `IssueTimeline`, `SearchPalette`).
- Exact activity event copy.
- Exact icons within the Bootstrap Icons set.
- Whether search is a Collapse panel or an inline region below the navbar, provided it keeps A’s compact, non-modal presentation.

### Unresolved product decisions — require judgment

1. Full production navigation set and overflow treatment.
2. Placement of My Issues, Notifications, Attention, Epics, Milestones, Settings, and repo scope in the one-layer navbar.
3. Notification badges and Inbox counts in the navbar.
4. Dark theme styling; A is light-only.
5. Loading, error, permission, and read-only states.
6. Mobile order of Properties/Details relative to activity.
7. Whether decline requires confirmation and whether bulk triage exists.
8. All/Mine and saved-view behavior in the new single toolbar.
9. Pagination or result limits; not demonstrated.
10. The 856px document measure at 1440px; approve or narrow through product decision.
11. 31px small-button touch targets.
12. Real pending-submission count and inbox count data.
13. Date/time localization; production currently has date-related issues, and A does not define the format.
14. Search ranking, scope, and permission semantics.
15. Create-issue entry point; A’s index has no “New issue” button.
16. Settings secondary navigation inside the A shell.
17. Board/Matrix/Plan/Timeline adaptation beyond the shell principles.

## 16. Evidence index

### Composition A screenshots

| Screenshot | State | Supports |
| --- | --- | --- |
| [`desktop-a-issues.png`](../../poc/compositions/screenshots/desktop-a-issues.png) | Default grouped issue index at 1440×900 | Page architecture, navbar, toolbar, table, grouping, row density |
| [`desktop-a-issue.png`](../../poc/compositions/screenshots/desktop-a-issue.png) | Issue detail top at 1440×900 | Breadcrumb, header, 8/4 layout, Properties and Details cards |
| [`desktop-a-activity.png`](../../poc/compositions/screenshots/desktop-a-activity.png) | Activity/comments and composer | Timeline typography, separators, comment editor |
| [`desktop-a-inbox.png`](../../poc/compositions/screenshots/desktop-a-inbox.png) | Inbox with four untriaged issues | Inbox table, search, Accept/Decline |
| [`mobile-a-issues.png`](../../poc/compositions/screenshots/mobile-a-issues.png) | 390×844 issue index | Collapsed navbar, hidden columns, mobile metadata line |
| [`mobile-a-issue.png`](../../poc/compositions/screenshots/mobile-a-issue.png) | 390×844 issue detail | Stacked document/title behavior |
| [`mobile-a-inbox.png`](../../poc/compositions/screenshots/mobile-a-inbox.png) | 390×844 inbox | Responsive triage table |

### Source references

| File | Use |
| --- | --- |
| [`TraditionalApp.svelte`](../../poc/compositions/src/variants/a/TraditionalApp.svelte) | Authoritative A layout, nav, index, detail, inbox |
| [`IssueBody.svelte`](../../poc/compositions/src/lib/IssueBody.svelte) | Rich issue content rendering |
| [`IssueTimeline.svelte`](../../poc/compositions/src/lib/IssueTimeline.svelte) | Activity, comments, composer |
| [`SearchPalette.svelte`](../../poc/compositions/src/lib/SearchPalette.svelte) | Search panel behavior |
| [`fixtures.js`](../../poc/compositions/src/lib/fixtures.js) | Fixture content and metadata vocabulary |
| [`issueModel.js`](../../poc/compositions/src/lib/issueModel.js) | Filtering, grouping, edits, triage semantics |
| [`app.css`](../../poc/compositions/src/styles/app.css) | Row cursor, document line-height, small layout utilities |
| [`lab.spec.js`](../../poc/compositions/tests/lab.spec.js) | Verified behaviors and screenshot capture |
| [`COMPARISON.md`](../../poc/compositions/COMPARISON.md) | Selection record and analytical comparison |

### Measured evidence

- Desktop captures: 1440×900.
- Mobile captures: 390×844.
- A index: 12 fully visible issue rows; 41px row height; 1294px table; 654px title column.
- A detail: 1320px main; 880/440 columns; 856px document; 416px card.
- Every measured 390px view in the handoff renders without horizontal page overflow.
- The PoC test suite passes 14 Playwright tests, including A’s search, filters, grouping, metadata edits, comments, inbox triage, empty states, and mobile behavior.
