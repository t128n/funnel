# Settings and public findings

Revision: 3d229791dadf073eab2c22302d1d59b3c421c81c
Workstream: E — Settings and public pages

## Finding: Appearance theme radios show no current selection on load

- Route: `/settings/appearance`
- Component: `src/routes/(app)/settings/appearance/+page.svelte`, `FormCheck`
- Viewport: 1440x900 (also reproduced after reload at other widths)
- Theme: light and dark
- Category: component behavior
- Suggested priority: P2
- Screenshot: screenshots/settings-public/settings-appearance-desktop-light-default.png; screenshots/settings-public/settings-appearance-desktop-dark-no-selection.png
- Existing issue match: none

### Problem
The three theme radios render unchecked regardless of the active theme. The page therefore shows no answer to "which theme am I using?" until the user clicks one. The footer of the app also offers the same choice through a dropdown, so the two surfaces disagree about the current state.

### Steps to reproduce
1. Set a theme from the navbar (Light or Dark); confirm `document.documentElement.dataset.bsTheme` and `localStorage["funnel:theme"]`.
2. Open `/settings/appearance`.
3. Inspect the three radios with `document.querySelectorAll('input[type=radio]')`.

### Actual behavior
All three inputs have `checked === false` on first render and after a reload; e.g. `[false, false, false]` with `data-bs-theme="dark"`. Clicking a radio checks it and applies the theme, but navigating away and back loses the selection again.

### Expected behavior
The radio matching the stored theme choice is checked on load (and while the page is open). `System` is checked when no explicit choice is stored.

### Impact
The section meant to answer "which appearance is active?" gives no answer and looks unset. Users can unknowingly re-apply a theme or think their preference was not saved.

### Suggested direction
Initialize the checked state from the theme store before first paint or re-render with a reactive `checked` property that Svelte updates on load. A `fieldset`/`legend` or radio-group name is already present; only the state binding needs fixing.

### Acceptance criteria
- [ ] Opening `/settings/appearance` with a stored Light, Dark, or System choice shows exactly that radio checked.
- [ ] The check mark survives reload and navigation between settings sections.
- [ ] Choosing a radio updates the page immediately and keeps that radio checked.

## Finding: Unsaved settings edits are discarded silently when switching sections

- Route: `/settings/session` → `/settings/features` (all settings sections behave the same)
- Component: `src/routes/(app)/settings/+layout.svelte`, `src/lib/components/settings/settings-form.svelte`
- Viewport: 1440x900 (mobile switcher has the same behavior)
- Theme: light
- Category: workflow
- Suggested priority: P2
- Screenshot: screenshots/settings-public/settings-session-desktop-light-unsaved-edit.png
- Existing issue match: none

### Problem
Every settings section keeps edits in client state until Save. Navigating to another settings section, using the mobile section switcher, or following a link away from Settings loses the edit with no warning, no dirty indicator, and no draft restoration. The public intake form does warn ("Discard this draft?"); settings does not.

### Steps to reproduce
1. Open `/settings/session`.
2. Change Idle lifetime from 30 to 45 (do not save).
3. Click `Features` in the settings sidebar, then return to `Session`.

### Actual behavior
Navigation happens immediately; the field is back to 30. No confirmation, toast, or unsaved marker appears at any point.

### Expected behavior
Either warn before leaving a dirty settings form (as `/intake` does), or keep the Save affordance persistent and show an explicit unsaved-changes state. At minimum, do not silently drop edits on an in-app navigation.

### Impact
A user who fills a multi-field page (Planning, Availability, Repositories) and then checks another section can lose the whole edit without noticing. It is a data-loss trap in the main configuration workflow.

### Suggested direction
Track a dirty flag in `SettingsForm`, expose it to the settings layout, and guard `beforeNavigate`/section-switcher changes with a Bootstrap modal or `window.confirm` consistent with `/intake`. Alternatively, preserve the draft per section until Save or Discard.

### Acceptance criteria
- [ ] Editing any settings field marks the section dirty (visible state).
- [ ] Leaving a dirty section prompts before discarding, including the mobile section switcher.
- [ ] Saving or explicitly discarding clears the dirty state.

## Finding: Save errors on long settings forms appear above the viewport

- Route: `/settings/planning`, `/settings/availability` (any settings page taller than the viewport)
- Component: `src/lib/components/settings/settings-form.svelte`, `src/routes/(app)/settings/availability/+page.svelte`
- Viewport: 1440x900
- Theme: light
- Category: feedback/state
- Suggested priority: P2
- Screenshot: screenshots/settings-public/settings-planning-desktop-light-error-offscreen.png; screenshots/settings-public/settings-availability-desktop-light-validation-error.png
- Existing issue match: none

### Problem
The error alert is rendered at the top of the form while the only Save button is at the bottom. On long forms the user submits from the bottom and the alert is injected hundreds of pixels above the current scroll position, so the click appears to do nothing.

### Steps to reproduce
1. Open `/settings/planning` on a 900px-high viewport.
2. Uncheck all five work days.
3. Click `Save Changes` at the bottom of the page.
4. Observe the viewport; then inspect the alert position.

### Actual behavior
The save fails (`planning.work_defaults.work_days must not be empty`) but the page stays where it was. Measured after submit: `scrollY = 744`, alert `getBoundingClientRect().top = -586`. On `/settings/availability`, the alert top is `-5` and only a clipped strip of the message is visible.

### Expected behavior
A failed save moves focus/scrolls the error summary into view (or shows inline feedback next to the footer/fields) so the user sees why nothing was saved.

### Impact
Users can repeatedly press Save on long forms without realising validation failed, particularly on Planning, Availability, and Repositories. This turns a recoverable validation error into a dead end.

### Suggested direction
Scroll and focus the alert (or an `aria-live` summary above the sticky footer) after a failed action. Keep the alert mounted with `role="alert"`; move the submit footer to a consistent position or render a compact error next to the Save button as well.

### Acceptance criteria
- [ ] Submitting an invalid long form makes the error visible without manual scrolling.
- [ ] Focus lands on the error summary or the first invalid field.
- [ ] The behavior is the same for `SettingsForm` pages and the Availability form.

## Finding: Confirmation dialogs do not take or trap focus and lack dialog semantics

- Route: `/settings/repositories` (same component on `/settings/projects`, `/settings/availability`, `/settings/github-app`)
- Component: `src/lib/components/settings/confirm-dialog.svelte`
- Viewport: 1440x900
- Theme: light
- Category: accessibility
- Suggested priority: P2
- Screenshot: screenshots/settings-public/settings-repositories-desktop-light-confirm-dialog.png
- Existing issue match: none

### Problem
The destructive confirmation modal opens with focus on `<body>`. Tabbing moves through controls behind the overlay before it reaches the dialog, and the dialog has `role="dialog"` but no `aria-modal` or accessible name. Escape closes it, but the keyboard path is not a modal path.

### Steps to reproduce
1. Open `/settings/repositories`.
2. Focus a row's "Actions" button, press Enter, then Tab to "Remove repository" and press Enter.
3. Inspect `document.activeElement` and press Tab three times.

### Actual behavior
`document.activeElement` is `BODY`. The next Tabs focus `Add repository` and `Save Changes` behind the modal, then the dialog's close button. The modal element has `role="dialog"`, `aria-modal="null"`, `aria-labelledby="null"`. On close, focus returns to `body`, not the trigger.

### Expected behavior
On open, focus moves to the dialog (Cancel or the title/close button); Tab is trapped inside it; background controls are inert or `aria-hidden`; the dialog has `aria-modal="true"` and `aria-labelledby` pointing at the title. Focus returns to the invoking control on close.

### Impact
Keyboard and screen-reader users can interact with page controls hidden behind a modal and may not find the confirmation at all. This affects every destructive confirmation in Settings.

### Suggested direction
Use the Bootstrap modal's focus handling rather than a bare `Modal` wrapper, or add a focus trap: focus the dialog on open, cycle Tab within it, set `aria-modal`/`aria-labelledby`, and restore the previously focused element on close.

### Acceptance criteria
- [ ] Opening any confirmation moves focus into the dialog.
- [ ] Tab and Shift+Tab cycle only through dialog controls.
- [ ] The dialog exposes `aria-modal="true"` and an accessible name.
- [ ] Closing returns focus to the control that opened it.

## Finding: Dark theme secondary buttons and semantic text colours fail contrast

- Route: `/settings/github-app`, `/settings/account`, `/settings/repositories` and all dark-mode settings/public pages
- Component: global Bootstrap dark theme usage (`btn-outline-secondary`, `.text-success`, `.text-danger`)
- Viewport: 1440x900 and 390x844
- Theme: dark
- Category: accessibility
- Suggested priority: P2
- Screenshot: screenshots/settings-public/settings-github-app-desktop-dark-default.png; screenshots/settings-public/settings-account-mobile-dark-default.png
- Existing issue match: none

### Problem
In dark mode, outline-secondary buttons use the fixed Bootstrap grey `#6c757d` on the page background `#212529` (3.29:1). They look disabled even when enabled: "Manage Installation", "Sign out", "Add repository", "Cancel". The semantic text colours are also fixed (`#198754` success = 3.40:1, `#dc3545` danger = 3.41:1), so statuses such as "Installed", "Staged for triage", "Saved.", and red error text are hard to read.

### Steps to reproduce
1. Choose Dark from the navbar Theme menu.
2. Open `/settings/github-app` and `/settings`.
3. Inspect a secondary outline button and a `.text-success`/`.text-danger` element in DevTools.

### Actual behavior
Computed colors are `rgb(108, 117, 125)` for outline-secondary text/border, `rgb(25, 135, 84)` for success text, and `rgb(220, 53, 69)` for danger text; page background is `rgb(33, 37, 41)`. Ratios are 3.29:1, 3.40:1, and 3.41:1, all below the 4.5:1 requirement for 16px text. Enabled secondary buttons read as disabled.

### Expected behavior
Dark mode uses colour-mode-aware tokens or lighter values so enabled secondary buttons and success/danger text reach at least 4.5:1 against `--bs-body-bg`, while remaining visually secondary.

### Impact
Every destructive cancel, repository add, sign-out, and success/error status in dark mode is harder to perceive; enabled actions can be mistaken for disabled ones. This affects the whole settings surface and the public success/error states.

### Suggested direction
Override dark-mode `--bs-btn-color`/`--bs-btn-border-color` for outline-secondary and use `--bs-success-text-emphasis` / `--bs-danger-text-emphasis` (or explicit accessible values) instead of the fixed `.text-success`/`.text-danger` utilities. Verify with a contrast checker in both themes.

### Acceptance criteria
- [ ] Enabled outline-secondary buttons in dark mode meet 4.5:1 text contrast.
- [ ] Success and danger text in dark mode meet 4.5:1 on the page background.
- [ ] The same components keep their current appearance in light mode.

## Finding: Settings validation messages are duplicated, leak internal keys, and are not tied to fields

- Route: `/settings/session`, `/settings/repositories`, `/settings/planning` (all `SettingsForm` pages)
- Component: `src/lib/components/settings/settings-form.svelte`
- Viewport: 1440x900
- Theme: light
- Category: feedback/state
- Suggested priority: P2
- Screenshot: screenshots/settings-public/settings-session-desktop-light-validation-error.png; screenshots/settings-public/settings-repositories-desktop-light-validation-error.png
- Existing issue match: none

### Problem
The same sentence is printed twice ("Settings could not be saved" as a heading and as the message), followed by raw server validation strings that expose internal setting keys. The offending field is not marked invalid, not focused, and has no `aria-describedby`, so a user has to translate `planning.work_defaults.work_days` or `session.idle_days` back to a label themselves.

### Steps to reproduce
1. Open `/settings/session`, clear Idle lifetime, and click Save Changes.
2. Repeat on `/settings/repositories` with a repository value such as `not-a-repo`.
3. Inspect the alert and the corresponding input classes.

### Actual behavior
The alert reads:
"Settings could not be saved" / "Settings could not be saved" / "session.idle_days must be a number".
The input keeps the normal border, has no `aria-invalid`, and is not focused. The same pattern produces "Repository must be in `owner/name` form" without marking the offending repository row.

### Expected behavior
One human-readable summary, field-level messages using the visible label ("Idle lifetime must be a whole number"), `is-invalid` + `aria-describedby` on the field, and focus moved to the first invalid control. Internal dotted keys stay in logs.

### Impact
Every settings validation failure is harder to act on than necessary and exposes implementation vocabulary to administrators. Repeated summary text adds noise and suggests two separate errors.

### Suggested direction
Map validator issue paths to field labels, deduplicate the summary, and render errors through the same field wrapper used by the settings pages. Have the server return a field key alongside the message, or derive it from the issue path.

### Acceptance criteria
- [ ] An invalid settings field is marked `.is-invalid` and linked with `aria-describedby`.
- [ ] The alert contains one summary plus human-readable, field-specific messages; no dotted config keys.
- [ ] Focus moves to the first invalid field after a failed save.

## Finding: Board WIP stage labels expose the raw enum spelling

- Route: `/settings/board`
- Component: `src/routes/(app)/settings/board/+page.svelte`
- Viewport: 1440x900
- Theme: light
- Category: visual consistency
- Suggested priority: P3
- Screenshot: screenshots/settings-public/settings-board-desktop-light-default.png
- Existing issue match: none

### Problem
The Work-in-progress labels are generated from `WIP_STAGES` with `text-capitalize`, producing "In-Progress" and "In-Review". The rest of the app calls these statuses "In Progress" and "In Review" (see `src/lib/labels.ts` and the Board).

### Steps to reproduce
1. Open `/settings/board`.
2. Compare the four WIP field labels with the Board column headers.

### Actual behavior
Labels read "Backlog", "Todo", "In-Progress", "In-Review"; the Board uses "In Progress" and "In Review".

### Expected behavior
The settings fields use the same display labels as the Board, without the hyphen and with both words capitalised.

### Impact
Administrators see two names for the same stage and may wonder whether they are different states.

### Suggested direction
Map `WIP_STAGES` to display labels from `#lib/labels` rather than deriving the label from the key.

### Acceptance criteria
- [ ] WIP labels match the Board's status labels exactly.
- [ ] Raw stage keys never appear in user-facing copy.

## Finding: Projects and People repeat the page title as the section heading

- Route: `/settings/projects`, `/settings/people`
- Component: `src/routes/(app)/settings/projects/+page.svelte`, `src/routes/(app)/settings/people/+page.svelte`
- Viewport: 1440x900
- Theme: light
- Category: complexity
- Suggested priority: P3
- Screenshot: screenshots/settings-public/settings-projects-desktop-light-default.png; screenshots/settings-public/settings-people-desktop-light-default.png
- Existing issue match: none

### Problem
The page h1 is repeated as an identically named h2 immediately below ("Projects" / "Projects", "People" / "People"). Other sections use a distinct section name ("Configured repositories", "Application", "Channels").

### Steps to reproduce
1. Open `/settings/projects` or `/settings/people`.
2. Read the heading order in the accessibility tree or inspect the page.

### Actual behavior
Two consecutive headings with the same text, at levels 1 and 2, separated only by the sidebar and a rule.

### Expected behavior
One page title, and a section heading that names what the section contains (for example "Configured projects" or no second heading when there is only one block).

### Impact
Screen-reader users hear a duplicate heading, and the visual hierarchy suggests a grouping that does not exist. It makes these two sections look less considered than the others.

### Suggested direction
Drop the inner h2 when it duplicates the page title, or rename it to the content it groups, matching the other settings pages.

### Acceptance criteria
- [ ] No settings page contains an h2 identical to its h1.
- [ ] Every remaining section heading describes its block and keeps the h1 → h2 order.

## Finding: Intake's required title is unmarked and empty submission uses a different error treatment

- Route: `/intake`
- Component: `src/routes/intake/+page.svelte`
- Viewport: 1440x900, 390x844
- Theme: light and dark
- Category: feedback/state
- Suggested priority: P3
- Screenshot: screenshots/settings-public/intake-desktop-light-empty-submit.png; screenshots/settings-public/intake-desktop-light-inline-error.png
- Existing issue match: none

### Problem
Title is the only required field but has no visible required marker or "required" help text. Submitting the form empty triggers only a transient browser-native bubble; submitting whitespace triggers the page's persistent inline error. The same rule gets two different treatments.

### Steps to reproduce
1. Open `/intake`.
2. Click Submit Issue with both fields empty.
3. Then enter three spaces in Title and submit again.

### Actual behavior
Empty submit: browser bubble "Please fill out this field.", `document.activeElement` is the title input, no `.is-invalid`, no `role="alert"` message. Whitespace submit: red border, inline "A title is required.", `aria-invalid="true"`. The Title label itself never indicates that it is required.

### Expected behavior
Title is visibly marked required, and an empty submit shows the same persistent inline error (and focus) as the whitespace case, rather than relying on a native tooltip that disappears.

### Impact
On a public form, a first-time submitter cannot tell which fields are required and may miss the transient native message, especially after scrolling or on a slow connection.

### Suggested direction
Add a required marker (and `aria-required` is already implied by `required`) and either remove `required` so the server-rendered inline error is consistent, or call `reportValidity` and also render the inline message on invalid.

### Acceptance criteria
- [ ] The required Title field is visibly marked as required.
- [ ] Empty and whitespace-only submissions produce the same persistent, announced inline error.
- [ ] The error is linked to the field via `aria-describedby`.

## Finding: Intake success state omits the staged submission reference

- Route: `/intake` (success state)
- Component: `src/routes/intake/+page.svelte`, `src/routes/intake/+page.server.ts`
- Viewport: 1440x900
- Theme: light
- Category: feedback/state
- Suggested priority: P3
- Screenshot: screenshots/settings-public/intake-desktop-light-success.png
- Existing issue match: none

### Problem
The success view has a `Reference` row ready for a submission id, but the action returns only `{ submitted: true }`, so the row is never rendered. The submitter gets confirmation but no identifier to quote to a triager.

### Steps to reproduce
1. Open `/intake`.
2. Submit a valid title and description.
3. Read the success panel.

### Actual behavior
The panel shows "Issue Submitted", status "Staged for triage", Copy Link, and Submit Another. There is no reference number, and `form.ref` is undefined because `createSubmission`'s id is never returned.

### Expected behavior
The success panel shows a short reference (the staged submission id or a friendly equivalent) that the submitter can quote, and "Copy Link" copies a link that identifies the submission.

### Impact
A public submitter cannot refer to their submission in a follow-up. The unused `Reference` markup suggests this was intended and regressed.

### Suggested direction
Return `ref: id` from the action and render it. If the internal id should not be public, derive a short opaque reference at staging time.

### Acceptance criteria
- [ ] The success state displays a reference for the staged submission.
- [ ] The reference is stable and can be used by a triager to find the item.
- [ ] No internal database identifier is exposed if that is a product constraint.

## Finding: 404 page's primary action reloads the failing URL and repeats the error label

- Route: `/nonexistent-route`
- Component: `src/lib/components/common/ErrorState.svelte`
- Viewport: 1440x900, 390x844
- Theme: light and dark
- Category: navigation/IA
- Suggested priority: P3
- Screenshot: screenshots/settings-public/error-404-desktop-light.png; screenshots/settings-public/error-404-mobile-dark.png
- Existing issue match: none

### Problem
For a 404, "Try Again" is the primary button but simply reloads the same missing URL, which can never succeed. The page also shows both "Page not found" and "Not Found". The only useful recovery action, "Back to Issues", is the secondary button.

### Steps to reproduce
1. Open `/nonexistent-route`.
2. Click Try Again.

### Actual behavior
The URL remains `/nonexistent-route` and the same 404 is rendered. The heading and subtitle repeat the status in two forms.

### Expected behavior
For 404, the primary action is a real destination (Issues/Home), with no reload, and the copy states the status once. Keep Try Again for 5xx/network errors where reload can recover.

### Impact
The most prominent action is a dead end, adding a pointless reload and delaying recovery.

### Suggested direction
Make `reload()` conditional on recoverable statuses (5xx/network); for 4xx show "Back to Issues" as primary. Remove the duplicated status line or use one sentence of explanation.

### Acceptance criteria
- [ ] A 404 offers a working navigation action as its primary button.
- [ ] Try Again is absent or secondary on non-recoverable 4xx.
- [ ] The status is stated once.

## Finding: Invalid issue URL renders an unstyled error line with internal jargon

- Route: `/issues/demo/funnel/9999`
- Component: issue detail error state (`/issues/...`)
- Viewport: 1440x900, 390x844
- Theme: dark
- Category: feedback/state
- Suggested priority: P3
- Screenshot: screenshots/settings-public/error-issue-invalid-9999-desktop-dark.png; screenshots/settings-public/error-issue-invalid-9999-mobile-dark.png
- Existing issue match: none

### Problem
A missing issue shows a bare red sentence "Issue demo/funnel#9999 is not mirrored", a Retry link floated at the far right, and "Return to Issues" as a plain link. Composition A §11 calls for a Bootstrap Alert (or the existing error component) in the content region with plain language and recovery links; this is neither.

### Steps to reproduce
1. Open `/issues/demo/funnel/9999` (or any id that does not exist).
2. Compare with the documented error state and with the 404 page.

### Actual behavior
The shell is preserved, but the content is an unstyled `text-danger` line with an error icon. "Retry" sits on the opposite edge of the page from the message. The word "mirrored" is internal sync vocabulary. The breadcrumb renders `demo/funnel / #9999` with an odd space.

### Expected behavior
A bordered Bootstrap alert or the shared error component says, in plain language, that the issue does not exist or is not available, with the recovery links grouped together ("Return to Issues" primary/secondary, Retry only if it can recover).

### Impact
The invalid-detail state looks unfinished and uses vocabulary a non-operator user will not understand, while the Retry link is easy to miss.

### Suggested direction
Reuse `ErrorState`/an `Alert` inside the issue page shell, and reuse the same copy pattern for missing and not-mirrored issues. Put the actions in one group.

### Acceptance criteria
- [ ] Missing issues render a Bootstrap alert or the shared error component inside the shell.
- [ ] The copy avoids internal sync terms (or explains them).
- [ ] Recovery actions are grouped and have a clear primary action.

## Finding: Brand assets still use the pre-pivot #3574f0 blue

- Route: `/favicon.svg`, `/site.webmanifest`
- Component: `static/favicon.svg`, `static/site.webmanifest`
- Viewport: n/a
- Theme: n/a
- Category: visual consistency
- Suggested priority: P3
- Screenshot: screenshots/settings-public/brand-favicon-pre-pivot-blue.png
- Existing issue match: #15

### Problem
The favicon and web manifest still declare the pre-pivot brand blue `#3574f0`, while the application now uses Bootstrap's default primary `#0d6efd` (and the error page no longer uses the old blue). Issue #15 reports this for the favicon, webmanifest, and error page; the error-page part is no longer present, but the static assets still match.

### Steps to reproduce
1. Request `/favicon.svg` and `/site.webmanifest`.
2. Read the `fill` and `theme_color` values.

### Actual behavior
`static/favicon.svg` uses `fill="#3574f0"` and `static/site.webmanifest` uses `"theme_color": "#3574f0"`. The favicon renders as a blue rounded square.

### Expected behavior
The brand assets use the current primary blue (or the approved brand asset), consistent with the app and issue #15's resolution.

### Impact
Browser tabs, bookmarks, and installed PWA chrome show a blue that no longer matches the product. It is a small but persistent brand inconsistency.

### Suggested direction
Regenerate the favicon/PNG icons and `theme_color` with the current approved brand colour as part of closing #15.

### Acceptance criteria
- [ ] `favicon.svg`, icon PNGs, and `site.webmanifest` use the current brand colour.
- [ ] The installed PWA window chrome matches the app’s primary blue.
- [ ] Issue #15 can be closed.
