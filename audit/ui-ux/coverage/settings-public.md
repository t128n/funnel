# Settings and public coverage

Revision: 3d229791dadf073eab2c22302d1d59b3c421c81c
Server: http://127.0.0.1:3005
Browser session: ux-settings

All routes below are from the isolated demo instance, pre-authenticated as Riley Demo (admin). Mutations were limited to this instance; the test intake submission is disposable. Theme was set through the navbar Theme menu and confirmed with `document.documentElement.dataset.bsTheme` plus `localStorage["funnel:theme"]`.

## Settings sections

| Route / interaction | Desktop | Tablet | Mobile | Light | Dark | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/settings` (Account) default | ✅ | — | ✅ | ✅ | ✅ | audited | Profile `dl`, Session block, Sign out. Sign out not clicked (would end the audit session). |
| `/settings/appearance` default, selected radio, theme switch, reload persistence | ✅ | — | — | ✅ | ✅ | audited | Every radio is unchecked on load with Light, Dark, and system; clicking one selects it and applies the theme. |
| `/settings/features` default, toggle on, reload persistence, toggle off | ✅ | — | — | ✅ | — | audited | Instant save with per-row "Saved"; persists across reload; cookie-based browser override. |
| `/settings/availability` default, blocked-window empty state, invalid timezone save | ✅ | — | — | ✅ | — | audited | Empty state "No blocked windows yet."; invalid IANA zone returns "Invalid availability request" in an alert. Calendar feed create/revoke not run. |
| `/settings/repositories` default, add row, invalid repo save, remove row, confirm dialog, cancel via Esc | ✅ | ✅ | — | ✅ | ✅ | audited | Remove is confirmed; error quotes `owner/name`; empty state source-only. Host URLs are read-only display values. |
| `/settings/projects` default, add row, remove row, confirmation | ✅ | — | — | ✅ | — | audited | Same add/remove/confirm pattern as Repositories. |
| `/settings/intake` default | ✅ | — | — | ✅ | — | audited | One select, options from configured repositories; no invalid value reachable through the UI. |
| `/settings/board` default, mobile section switcher | ✅ | — | ✅ | ✅ | ✅ | audited | WIP stage labels read "In-Progress"/"In-Review". Numeric inputs use native min. |
| `/settings/planning` default, uncheck all work days + save (server error), maintainer roster | ✅ | ✅ | — | ✅ | ✅ | audited | Error is inserted at the top of a long form, far above the viewport after saving from the footer. |
| `/settings/notifications` default, toggle + save, restore | ✅ | — | — | ✅ | — | audited | Success "Saved." beside the footer; values persist. |
| `/settings/people` default | ✅ | — | — | ✅ | — | audited | One account. Role select + per-row Save; role change not executed (self-demotion). Last-admin guard exists in the action. |
| `/settings/github-app` default | ✅ | — | — | ✅ | ✅ | audited | Read-only credential list; destructive Reset GitHub App has a confirmation. Reset not executed. |
| `/settings/sync` default | ✅ | — | — | ✅ | — | audited | Three numeric columns. |
| `/settings/session` default, empty save, decimal/negative input, keyboard-only save, success | ✅ | — | — | ✅ | — | audited | Empty save returns a raw `session.idle_days` message; keyboard-only completion via field → Tab → Enter works. Restored to 30 days. |
| Settings sidebar desktop: groups, active pill, `aria-current`, focus ring | ✅ | — | — | ✅ | ✅ | audited | 3 groups (Personal/Workspace/System) and 14 links; active link has `aria-current="page"`. |
| Settings section switcher below `lg`: initial value, keyboard change | — | ✅ | ✅ | ✅ | ✅ | audited | Native select with optgroups; keyboard ArrowDown/Enter navigates. |
| Deep links into every section | ✅ | — | — | ✅ | — | audited | Each section resolves directly; unknown section falls to the root 404. |
| Unsaved edit then navigate to another section | ✅ | — | — | ✅ | — | audited | Session 30 → 45, then Features: no prompt, no dirty state, value reverted on return. |
| Keyboard-only settings form completion | ✅ | — | — | ✅ | — | audited | Tab from the field to Save Changes, Enter; "Saved." appears. |
| Keyboard-only destructive confirmation | ✅ | — | — | ✅ | — | audited | Actions menu → Enter → Tab → Enter opens the dialog; Escape closes. Focus starts on `body` and first Tabs land behind the modal. |

## Public and error surface

| Route / interaction | Desktop | Tablet | Mobile | Light | Dark | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/intake` default (no app navbar) | ✅ | ✅ | ✅ | ✅ | ✅ | audited | Focused 40rem shell; no app bar; 390px has no horizontal overflow. |
| `/intake` empty submit | ✅ | — | — | ✅ | — | audited | Native `required` bubble only; no persistent inline message. |
| `/intake` whitespace-only title | ✅ | — | — | ✅ | — | audited | Server returns inline error "A title is required."; `is-invalid` + `aria-describedby` used. |
| `/intake` valid submit + success state | ✅ | — | — | ✅ | — | audited | Success heading focused, status "Staged for triage", Copy Link / Submit Another. No Reference row. |
| `/intake` value preservation after failure | ✅ | — | — | ✅ | — | audited | Title/body/source echo back after validation failure (title trimmed by server). |
| `/nonexistent-route` (404) | ✅ | — | ✅ | ✅ | ✅ | audited | Brand, status 404, "Page not found" + "Not Found", Try Again, Back to Issues. Try Again reloads the same 404. |
| `/issues/demo/funnel/9999` invalid issue | ✅ | — | ✅ | — | ✅ | audited | Shell retained; bare red text "Issue … is not mirrored", right-aligned Retry, Return to Issues. |
| `/favicon.svg` + `site.webmanifest` theme colour | ✅ | — | — | — | — | audited | SVG/manifest still `#3574f0`; overlaps issue #15. |
| `/login` | — | — | — | — | — | blocked | Demo auth redirects to `/inbox`; not auditable. |
| `/onboarding` | — | — | — | — | — | blocked | Demo auth redirects to `/inbox`; not auditable. |

## Observations (not findings)

- Settings form labels render at Bootstrap's default 16px and controls at 38px; consistent across all settings pages, but larger than Composition A's measured 14px form labels for the issue-detail properties.
- Account, Session, Intake, and Sync have very little content for the 9-column content area; a single short field still stretches the full ~890px. Not broken, but the sections feel over-framed at 1440px.
- Appearance is the only section with an empty `description` in `sections.ts`, so its page h1 has no subtitle.
- Buttons use title case ("Save Changes", "Add repository", "Submit Another", "Copy Link") while headings and help text use sentence case.
- The `System → Session` section (session lifetime) and the `Account → Session` block (sign out) share a name for different concepts.
- Intake source option "Self-Service" is title-cased while the rest of the interface is sentence case.
- `/intake` initially server-renders the hotkey hint as "⌘ Enter" and swaps to "Ctrl Enter" after hydration on non-Mac browsers (brief flash).
- `People` and `Projects` repeat the page h1 as the section h2; heading order jumps from h1 to an identically named h2.
- Settings sidebar group labels ("Personal", "Workspace", "System") are plain `div`s in the accessibility tree, not headings or labelled groups; links are still reachable and the mobile select uses real `optgroup`s.
- The availability calendar-feed read-only URL state and its rotate/revoke confirmation were not exercised to avoid creating credentials on the instance.

## Untested / blocked

- `/login` and `/onboarding` — redirect in demo mode.
- Non-admin settings visibility and read-only field states — the demo user is the only admin and changing their role would compromise the instance.
- GitHub App reset — destructive and would break onboarding for this instance; confirmation copy inspected only.
- Availability calendar-feed create/copy/revoke — would mint a secret URL on the instance.
- Empty-state rows for Repositories/Projects — verified in source ("No repositories yet." / "No projects yet."), not reached in the UI because it requires deleting all rows.
- Loading ("Saving…") state was observed in source and is brief; no throttled capture.
