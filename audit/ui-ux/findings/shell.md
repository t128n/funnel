# Shell and navigation findings

Revision: 3d229791dadf073eab2c22302d1d59b3c421c81c
Server: http://127.0.0.1:3001
Browser session: `ux-shell`

## Finding: Global Search is a page-local focus shortcut, not global search

- Route: `/inbox`, `/board`, `/issues`, `/settings`, `/notifications`, `/issues/demo/funnel/1`
- Component: `src/lib/components/shell/AppBar.svelte`, `src/routes/(app)/+layout.svelte` (`focusSearch`)
- Viewport: 1440x900
- Theme: light
- Category: navigation/IA
- Suggested priority: P2
- Screenshot: `audit/ui-ux/screenshots/shell/shell-search-inbox-desktop-light-query.png`
- Existing issue match: none

### Problem
The navbar advertises a global **Search** control with a `Ctrl K` hint, but it opens nothing. It calls `focusSearch()`, which focuses whichever element has `id="issue-search"` on the current page, or navigates to `/issues` when no such element exists. Search scope therefore changes silently by route: on `/inbox` it filters the triage queue, on `/board` it filters kanban cards, on `/issues` it filters that index, and on `/settings`, `/notifications` or an issue detail it abandons the page and jumps to `/issues`. There is no panel, no result list, no query across repositories, no Enter-to-open-first-result and no Escape-to-close. Composition A §10 specifies a navbar search panel with recent defaults, cross-repository results and an explicit close affordance.

### Steps to reproduce
1. Open `/inbox`, click **Search** in the navbar.
2. Type `postgres`. The URL becomes `/inbox?q=postgres` and only the single inbox row remains; issues elsewhere are not reachable from this result set.
3. Open `/settings` and press `Ctrl K`. The browser navigates to `/issues` and focuses the index search field.
4. Open `/notifications` and press `Ctrl K`. Same jump to `/issues`; the notification page is lost.

### Actual behavior
The navbar Search behaves as a focus accelerator for a page-local filter. Its aria-label is always “Search issues” even when it searches inbox submissions or kanban cards. Users cannot search the whole tracker from the shell; on several routes the control performs an unexpected navigation.

### Expected behavior
A single global search surface reachable from the navbar and `Ctrl/Cmd+K`, with results across all repositories, current scope shown, Enter to open the first result, Escape to close, and focus returned to the trigger. If the product intentionally has no global search yet, the navbar control should be labelled and presented as a page-filter shortcut rather than a global affordance.

### Impact
Core discovery workflow is missing and the most prominent control in the shell does something different on every route. A user searching from Settings or an issue document loses their context.

### Suggested direction
Implement the Composition A search panel (or reuse the product’s existing search index) behind the navbar button and `Mod+K`; keep the page-local filter fields separate and do not route the global shortcut through `#issue-search`. Until then, rename/hide the global affordance.

### Acceptance criteria
- [ ] Navbar Search and `Mod+K` open the same global search surface from every app route.
- [ ] Results include issues from both `demo/funnel` and `demo/platform` regardless of the current page.
- [ ] Enter opens the first result; Escape closes and returns focus to the Search control.
- [ ] The page-local index/inbox/board filters remain independent and are not focused by the global shortcut.

## Finding: Repository scope control is a transient page filter and does not scope every list

- Route: `/issues`, `/inbox`, `/board`, any primary nav click
- Component: `src/lib/components/shell/AppBar.svelte` (`setRepo`, `repoLabel`)
- Viewport: 1440x900, 390x844
- Theme: light
- Category: navigation/IA
- Suggested priority: P2
- Screenshot: `audit/ui-ux/screenshots/shell/shell-inbox-desktop-light-repo-scoped.png`
- Existing issue match: #99

### Problem
The app-bar repository dropdown edits the `repo` query parameter only on the current URL. Every primary nav link (`/issues`, `/board`, `/inbox`, …) drops the parameter, so the “global” scope silently resets to All repositories on the next navigation. Meanwhile the same parameter is only partially honoured: on `/inbox?repo=demo/platform` the table still lists four `demo/funnel` intake submissions, and the Inbox badge remains `6` while the scoped table has five rows. At 992–1199px the current scope label is hidden (`d-lg-none d-xl-inline`), leaving only an unlabelled-looking folder icon and caret.

### Steps to reproduce
1. Open `/issues`, choose **Repository scope → demo/platform**. URL is `/issues?repo=demo%2Fplatform`; content is reduced to platform issues.
2. Click **Board** in the navbar. URL is `/board`, scope label reads **All repositories**, and platform-only scoping is gone.
3. Open `/settings` and choose **Repository scope → demo/platform**. URL becomes `/settings?repo=demo%2Fplatform` and the label changes, but the Settings page has no repository-scoped content and nothing changes.
4. Open `/inbox?repo=demo%2Fplatform`. The table contains four `demo/funnel` submissions plus one platform untriaged issue; the navbar Inbox badge still reads `6`.
5. Resize to 1024px. The scope control shows only a folder icon and caret.

### Actual behavior
The control looks like a persistent global scope but behaves like a disposable per-page filter. On pages without repository-scoped content it still writes `?repo=` and relabels itself, so the shell claims a scope the page does not apply. Some lists ignore it, and its current value disappears at laptop widths.

### Expected behavior
Either make repository scope genuinely global — persist it across navigation, apply it to every issue list (including inbox submissions and shell counts), and keep its value visible — or remove it from the app bar as proposed in #99 and leave repo filtering to the Filters popover.

### Impact
Users believe they are looking at one repository and are shown another repository’s rows; counts disagree with the visible list; the scope resets without notice. The app bar duplicates the Filters popover’s repo dimension, adding a second path to the same state (#99).

### Suggested direction
Prefer #99: remove the app-bar scope control and keep repo selection in Filters. If it stays, carry `repo` through primary navigation, filter every list consistently (including intake submissions) and scope the navbar badge counts.

### Acceptance criteria
- [ ] Choosing a repository changes every list that shows repository-scoped content, including `/inbox` submissions.
- [ ] The selection survives navigation between `/issues`, `/board`, `/inbox`, `/matrix` and back.
- [ ] Navbar counts agree with the scoped lists, or are explicitly labelled as global.
- [ ] The current scope is readable at every width where the control is visible.
- [ ] Either the app-bar control or the Filters repo control is removed as the duplicate path.

## Finding: Overflow destinations have no active state in the navbar

- Route: `/day`, `/attention`, `/epics`, `/milestones`, `/issues?assignee=me`
- Component: `src/lib/components/shell/AppBar.svelte`, `navigation.ts` (`OVERFLOW_NAV`)
- Viewport: 1440x900
- Theme: light
- Category: navigation/IA
- Suggested priority: P2
- Screenshot: `audit/ui-ux/screenshots/shell/shell-day-desktop-light-navbar.png`
- Existing issue match: none

### Problem
When the current page is an overflow destination, the navbar marks the matching item inside the closed **More** dropdown (`aria-current="page"`, `.active`) but the `More` toggle itself gets neither an active style nor an accessible current-page indication. Nothing in the visible navbar shows that the user is on My Day, Attention, Epics, Milestones, or My Issues. The same applies to `/issues?assignee=me`, where the primary Issues link is also inactive.

### Steps to reproduce
1. Open `/day` at 1440px. No navbar link is highlighted; the More menu is closed.
2. Open `/issues?assignee=me`. Issues is not active and More is not active.
3. Open More on `/epics` and confirm the Epics item is the only place the active state exists.

### Actual behavior
Five destinations are invisible as current locations in the shell. The active state is only present on a `display:none` dropdown item, so it is not announced either.

### Expected behavior
The `More` toggle shows an active/current treatment whenever one of its items matches the current page, and exposes the current destination to assistive technology (for example an updated accessible name or `aria-current` on the toggle). The primary nav should continue to mark the correct destination.

### Impact
Wayfinding and orientation regress for every overflow destination; the shell looks unselected on those pages, and screen-reader users get no current-page cue.

### Suggested direction
Derive `overflowActive` from `OVERFLOW_NAV` + `isNavActive`, apply it to the More toggle (Bootstrap active styling or an underline/dot consistent with the navbar), and expose the active item name in the toggle’s accessible name.

### Acceptance criteria
- [ ] On every overflow route, the More toggle is visibly marked as current.
- [ ] The current destination is announced by screen readers without opening the menu.
- [ ] On `/issues?assignee=me`, the shell shows My Issues as current rather than showing nothing.
- [ ] Light and dark themes both retain the same active treatment.

## Finding: Mobile navigation stays expanded after repository, account and brand navigation

- Route: `/inbox` → `/settings`, `/board?repo=…`, brand → `/issues`
- Component: `src/lib/components/shell/AppBar.svelte` (`setRepo`, `openSettings`, brand link)
- Viewport: 390x844
- Theme: light
- Category: responsive
- Suggested priority: P2
- Screenshot: `audit/ui-ux/screenshots/shell/shell-settings-mobile-light-nav-stuck-open.png`
- Existing issue match: none

### Problem
At widths below 992px the navigation is a collapsible menu. Primary links call `closeNav`, but choosing a repository, choosing Account/Settings from the account menu, or tapping the `funnel` brand navigates without closing the menu. The expanded 386px-tall menu remains on top of the new page, hiding the top of its content. The source comment on `navOpen` explicitly promises that scope and destination choices close the menu.

### Steps to reproduce
1. At 390x844 open `/inbox` and tap the hamburger. Menu expands (`aria-expanded="true"`, navbar height 386px).
2. Tap **Account menu → Account**. The app navigates to `/settings`, but `aria-expanded` is still `true` and the navbar is still 386px tall over the Settings page.
3. Repeat with **Repository scope → demo/platform**: URL changes to `/board?repo=…` but the menu stays open.
4. Repeat by tapping the `funnel` brand from `/board`: navigates to `/issues`, menu stays open.

### Actual behavior
The menu covers the destination page until the user finds and taps the hamburger again. On `/settings` it hides the page title and the section navigation.

### Expected behavior
Every navigation initiated from the collapsed menu closes it and leaves `aria-expanded="false"`; this includes repo selection, account links, brand, and the search shortcut.

### Impact
On the required mobile viewport, part of every affected navigation appears to fail; users must dismiss the menu manually before they can see the page they selected.

### Suggested direction
Close the menu in `setRepo`, `openSettings`, the brand click handler, and any handler that performs navigation; consider a single `navigate()` wrapper so future items cannot forget it. Add a regression test at 390px.

### Acceptance criteria
- [ ] After repo selection from the mobile menu, the menu is closed and the new scope is visible.
- [ ] After Account/Settings/brand navigation, the menu is closed.
- [ ] `aria-expanded` matches the visual state after every navigation.
- [ ] Focus is not left on a hidden menu item after closing.

## Finding: “Skip to main content” is rendered underneath the navbar and invisible when focused

- Route: every app route (tested `/inbox`)
- Component: `src/lib/components/shell/AppShell.svelte`, `src/lib/styles/app.css`
- Viewport: 1440x900
- Theme: light
- Category: accessibility
- Suggested priority: P2
- Screenshot: `audit/ui-ux/screenshots/shell/shell-inbox-desktop-light-skip-link-focus.png`
- Existing issue match: none

### Problem
The first Tab stop is the skip link. Its element is focusable and its computed box is 185×42 at `(8, 8)`, but `elementsFromPoint` at that location returns `.navbar-brand` and the navbar, not the skip link. The absolutely positioned skip link appears before the relatively positioned `.navbar` in the DOM and has no `z-index`, so the navbar paints over it. The screenshot taken while the link is focused shows only the normal navbar — there is no visible focus indicator.

### Steps to reproduce
1. Open `/inbox` at 1440x900, press Tab once.
2. `document.activeElement` is the skip link and its rect is at the top-left.
3. Inspect `document.elementsFromPoint(28, 28)` — the top hit is the brand link; the skip link is below the navbar in paint order.
4. Press Enter: the page does jump to `#main`, but the focused control was never visible.

### Actual behavior
The skip link works only if the user already knows it is there and presses Enter blindly. Sighted keyboard users see no focus ring and cannot discover it.

### Expected behavior
On focus, the skip link is painted above the navbar, fully visible, with a clear focus outline and readable contrast.

### Impact
The primary keyboard bypass mechanism for the six-link navbar is effectively invisible on every route.

### Suggested direction
Give the skip link a stacking context above the navbar (for example `z-index` at or above the navbar’s layer, or move it after the navbar and use `position: fixed`), and verify with a screenshot at 390px and 1440px.

### Acceptance criteria
- [ ] Tabbing once reveals a clearly visible skip link over the navbar.
- [ ] The link is the topmost hit target at its own coordinates.
- [ ] Activating it keeps the existing focus move to `#main`.
- [ ] Works in light and dark themes and at 390px.

## Finding: Navbar dropdowns ignore Escape and arrow keys

- Route: every app route (tested `/inbox`)
- Component: `src/lib/components/shell/AppBar.svelte` (More, repository, theme, account dropdowns)
- Viewport: 1440x900
- Theme: light and dark
- Category: accessibility
- Suggested priority: P3
- Screenshot: `audit/ui-ux/screenshots/shell/shell-epics-desktop-light-more-menu.png`
- Existing issue match: none

### Problem
Opening any navbar dropdown with the keyboard leaves focus on the toggle. ArrowDown/ArrowUp do not move into the menu, and Escape does not close an open menu even when focus is on a menu item. The menu does close when Tab moves focus out of it, so there is no focus trap, but the standard Bootstrap dropdown keyboard contract is missing.

### Steps to reproduce
1. Focus the **More** toggle and press Enter. The menu opens; focus remains on More.
2. Press ArrowDown. Focus remains on More.
3. Tab into “My Issues”, then press Escape. The menu stays open (`aria-expanded="true"`, `.show`).
4. Tab out of the menu; it then closes.

### Actual behavior
Keyboard users must Tab through every item and cannot dismiss an open menu with Escape beyond tabbing all the way out or clicking elsewhere.

### Expected behavior
ArrowDown/ArrowUp move focus through menu items; Escape closes the menu and returns focus to its toggle, matching Bootstrap 5 dropdown behavior.

### Impact
Slower, surprising keyboard operation of the primary navigation and account controls on every route. Mouse and touch users are unaffected.

### Suggested direction
Add keydown handling to the shared dropdown wrapper or configure SvelteStrap’s dropdown to handle `Escape`, `ArrowDown` and `ArrowUp`; cover More, repo, theme and account with the same behaviour.

### Acceptance criteria
- [ ] Escape closes any open navbar dropdown and restores focus to its toggle.
- [ ] ArrowDown/ArrowUp move focus through the open menu.
- [ ] Home/End or wrap behaviour is consistent with Bootstrap if implemented.
- [ ] Works in both themes.

## Finding: Search placeholder promises issue-ID search that does not work

- Route: `/issues?q=FUN-1`
- Component: `src/lib/components/filter/FeedSearch.svelte`, issue search/query handling
- Viewport: 1440x900
- Theme: light
- Category: feedback/state
- Suggested priority: P3
- Screenshot: `audit/ui-ux/screenshots/shell/shell-search-issues-desktop-light-id-empty.png`
- Existing issue match: #21

### Problem
The index search field says “Search title, body, or issue ID”. Entering a real identifier such as `FUN-1` returns the empty state, while title words work (`flicker`, `cache`, `deploy signing` all return matches). The same placeholder is reused in Inbox and Board. Users are told an identifier search is available when it is not.

### Steps to reproduce
1. Open `/issues`.
2. Type `FUN-1` into the search field.
3. The result count becomes 0 and the page shows “No issues match this view”.
4. Type `flicker`; the FUN-1 row is found by title.

### Actual behavior
Identifier queries never match. The empty state gives no hint that identifiers are unsupported.

### Expected behavior
Either identifier search works (as advertised), or the placeholder/label stops promising it and documents the fields that are searched.

### Impact
A conventional issue-tracker lookup (`FUN-1`, `PLT-5`) silently fails and looks like the issue does not exist.

### Suggested direction
Teach the query path to match `owner/name#number` / `FUN-1` identifiers, or change the placeholder to “Search title, body, or comments” until #21 lands.

### Acceptance criteria
- [ ] `FUN-1` and `PLT-5` find their issues from the index, inbox and board search fields.
- [ ] Placeholder and accessible name match the implemented fields.
- [ ] The empty state explains which fields were searched.

## Finding: Index search truncates at laptop widths (residual #16)

- Route: `/issues?q=deploy signing key rotation checklist`
- Component: `src/lib/components/filter/FeedSearch.svelte` + `/issues` toolbar layout
- Viewport: 1024x768 (also 992x768); 1440x900 is fine
- Theme: light
- Category: responsive
- Suggested priority: P3
- Screenshot: `audit/ui-ux/screenshots/shell/shell-search-issues-1024-light-truncated.png`
- Existing issue match: #16

### Problem
At 1440px the index search is 396px wide and the old #16 symptom does not reproduce. At 992–1024px, however, the same toolbar puts the search on one row with four selects: the input is 248–255px client width while a normal 38-character query needs ~270px, so the value ends mid-word (“deploy signing key rotation check…”). The 768px and 390px layouts give the field its own full-width row and are fine.

### Steps to reproduce
1. Set the viewport to 1024x768.
2. Open `/issues?q=deploy%20signing%20key%20rotation%20checklist`.
3. Observe the input width 248px vs scrollWidth 270px; the tail of the query is not visible.
4. Repeat at 1440px: width 396px and no truncation.

### Actual behavior
Search text is clipped in the common small-laptop band even though the issue was originally reported at 1440px.

### Expected behavior
The search field keeps enough width to read a normal query, or moves to its own row when the toolbar container is too narrow (container-query/flex-wrap), as #16 proposes.

### Impact
Users cannot read or verify what they searched for at 992–1024px; the clear button and tail of the query compete for the same 248px.

### Suggested direction
Treat the toolbar as a container: give the search a sensible min-width and let the selects wrap below it when space is short. Verify 992, 1024, 1199 and 1200.

### Acceptance criteria
- [ ] A 40-character query is legible at 992, 1024 and 1200px without horizontal scrolling.
- [ ] The search and select controls do not overlap or shrink below a usable width.
- [ ] The same rules apply to the Inbox and Board search fields that share the component.

## Finding: Dark navbar is indistinguishable from the dark page background

- Route: every app route
- Component: `.app-bar` / `bg-dark` in `AppBar.svelte`, `app-main` background
- Viewport: 1440x900, 390x844
- Theme: dark
- Category: visual consistency
- Suggested priority: P3
- Screenshot: `audit/ui-ux/screenshots/shell/shell-inbox-mobile-dark-menu-open.png`
- Existing issue match: none

### Problem
In dark mode both the navbar and the page background resolve to `rgb(33, 37, 41)` and the navbar has no bottom border. The shell loses its edge: the expanded mobile menu looks like a list in the page, and on desktop the breadcrumb/heading appear to start directly under the nav items with no surface separation.

### Steps to reproduce
1. Switch the Theme control to **Dark** (`document.documentElement.dataset.bsTheme === 'dark'`).
2. Compare `getComputedStyle(nav).backgroundColor` and `getComputedStyle(body).backgroundColor`: both `rgb(33, 37, 41)`.
3. Open the mobile menu at 390px; the 386px menu region and the page below are the same flat surface.

### Actual behavior
The navbar’s visual boundary disappears in dark mode; only the brand divider and the controls themselves suggest a header.

### Expected behavior
The dark navbar remains a distinct shell surface — for example a slightly different `--bs-dark` elevation or a `border-bottom` using the dark border token — while keeping the approved Bootstrap palette.

### Impact
The one global navigation layer is harder to parse in dark mode; the mobile menu is especially ambiguous.

### Suggested direction
Add a dark-only border-bottom or a token-derived elevated navbar background; do not introduce a new palette. Validate contrast and screenshots at both required viewports.

### Acceptance criteria
- [ ] The navbar has a visible boundary against the page in dark mode on desktop and mobile.
- [ ] The expanded mobile menu is visually separable from the content it pushes down.
- [ ] Light mode is unchanged.

## Finding: 404 page leaves the app shell and offers a retry that cannot succeed

- Route: `/nonexistent-route`
- Component: `src/routes/+error.svelte`, `src/lib/components/common/ErrorState.svelte`
- Viewport: 1440x900
- Theme: light
- Category: feedback/state
- Suggested priority: P3
- Screenshot: `audit/ui-ux/screenshots/shell/shell-404-desktop-light-default.png`
- Existing issue match: none

### Problem
An unknown URL renders the root error page outside the app layout: no navbar, no primary navigation, no theme control, no skip link. The copy repeats the state (“Page not found” then “Not Found”), and the primary action **Try Again** re-requests the same nonexistent URL, so it can only fail again. Composition A §11 requires the shell and page header to stay in place and the error to appear in the content region.

### Steps to reproduce
1. Open `/nonexistent-route`.
2. Observe a bare centered page with `funnel`, `404`, “Page not found”, “Not Found”, Try Again and Back to Issues; `document.querySelector('nav.navbar')` is null.
3. Click Try Again; the same 404 page is reloaded.

### Actual behavior
The error page is a dead end apart from Back to Issues, loses theme and navigation context, and offers a misleading primary action.

### Expected behavior
Render the 404 inside the authenticated shell with the navbar and page header intact, show the error in the content region, and offer only actions that can succeed (Back to Issues, maybe Search). Avoid repeating “Page not found” and “Not Found”.

### Impact
Users who mistype a URL or follow a stale link lose all global navigation, and the most prominent button cannot recover the situation.

### Suggested direction
Move the 404 into the `(app)` layout or render `AppShell` + `PageHeader` + an `Alert`/`ErrorState` in the content region. Remove Try Again for 404 and keep it for retryable errors.

### Acceptance criteria
- [ ] A 404 on an app route keeps the navbar, theme and skip link.
- [ ] The error message appears in the content region with the page header.
- [ ] No action on a 404 re-requests the same missing URL as its primary CTA.
- [ ] The status message is not duplicated.

## Finding: Breadcrumb landmarks are unlabelled

- Route: `/inbox`, `/issues`, `/issues/demo/funnel/1`, `/inbox/submission/...`
- Component: Sveltestrap `Breadcrumb` usage in page components
- Viewport: 1440x900
- Theme: light
- Category: accessibility
- Suggested priority: P3
- Screenshot: none (DOM inspection)
- Existing issue match: none

### Problem
Every breadcrumb renders `<nav class="mb-2">` without `aria-label="breadcrumb"`. The page therefore has multiple unnamed navigation landmarks (the navbar plus the breadcrumb), and assistive technology cannot distinguish them in a landmark list. Bootstrap’s breadcrumb convention requires the label.

### Steps to reproduce
1. Open `/inbox` or `/issues/demo/funnel/1`.
2. Inspect `document.querySelectorAll('main nav')`: the breadcrumb nav has no `aria-label`.
3. Compare with `/settings`, whose section nav is labelled `aria-label="Settings"`.

### Actual behavior
Two or more nav landmarks, one or more unnamed. The breadcrumb cannot be skipped to by landmark name.

### Expected behavior
`<nav aria-label="breadcrumb">` on every breadcrumb, with the current item marked `aria-current="page"` (already present).

### Impact
Screen-reader and keyboard users relying on landmark navigation cannot identify the breadcrumb as distinct from the app bar.

### Suggested direction
Pass `aria-label="breadcrumb"` through the Breadcrumb component (or wrap it) and reuse a single breadcrumb component so the convention cannot drift.

### Acceptance criteria
- [ ] Every breadcrumb nav has the accessible name “breadcrumb”.
- [ ] The navbar has its own distinct landmark name (for example “Primary”).
- [ ] No unnamed nav landmarks remain on index or detail pages.

## Finding: Repository and theme menus expose selection visually only

- Route: every app route (navbar menus)
- Component: `src/lib/components/shell/AppBar.svelte`
- Viewport: 1440x900
- Theme: light and dark
- Category: accessibility
- Suggested priority: P3
- Screenshot: `audit/ui-ux/screenshots/shell/shell-theme-menu-desktop-light-open.png`
- Existing issue match: none

### Problem
Menu items for repository scope and theme are plain buttons whose selected state is communicated by the `.active` class or a check icon that is `aria-hidden`. There is no `aria-current`, `aria-checked`, `role="menuitemradio"` or accessible “selected” text. A screen-reader user opening Repository scope or Theme hears the options but not which one is active.

### Steps to reproduce
1. Open the Theme menu. The current choice is indicated only by a check glyph with `aria-hidden="true"`.
2. Open Repository scope. The active item has `.active` but no ARIA state.
3. Inspect both menus with an accessibility tree: no selected/checked semantics are exposed.

### Actual behavior
Selection is visual-only.

### Expected behavior
Expose the choice as a radio-style menu (`role="menuitemradio"` + `aria-checked`) or add a visually hidden “current” label and `aria-current` to the selected item.

### Impact
Non-visual users cannot confirm the current scope or theme before choosing, and may toggle blindly.

### Suggested direction
Use SvelteStrap’s dropdown item with an explicit selected/checked ARIA state. Keep the check icon for sighted users.

### Acceptance criteria
- [ ] The active repository is announced as selected/current.
- [ ] The active theme is announced as selected/current.
- [ ] Both menus remain keyboard and screen-reader operable.
