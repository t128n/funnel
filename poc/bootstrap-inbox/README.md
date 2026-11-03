# Funnel Inbox — Bootstrap PoC

A standalone, high-fidelity prototype of Funnel's Inbox built with plain HTML, Bootstrap 5, and a small amount of vanilla JavaScript. It is a design exploration, not a migration of the production frontend.

## Open it

No build step or package installation is required.

- Open `index.html` directly in a browser, or
- From the repository root, run `python -m http.server 8000` and visit `http://localhost:8000/poc/bootstrap-inbox/`.

Bootstrap and Bootstrap Icons are loaded from jsDelivr, so an internet connection is required on first load.

## What is included

- Dark global navbar with repository scope, global search (`Ctrl`/`Cmd` + `K`), notifications, theme control, and user menu.
- Persistent light sidebar on desktop; off-canvas navigation below 1200px.
- Master-detail inbox: issue list on the left, independently scrolling issue document on the right.
- Four sample issues adapted from the reference (ASY-1, ASY-3, ASY-2, FUN-53).
- Working issue selection, full-text search across titles, bodies, and comments, repository and assignment filters, and an empty state.
- Functional detail actions: assign/unassign, change status, add a comment, and an external "Open in GitHub" link.
- Light, dark, and system themes.
- Mobile list/detail navigation with a back control.

State is intentionally in memory only. Refreshing the page restores the initial state. The selected theme is stored in `localStorage`.

Sidebar destinations other than Inbox, the notification bell, and the profile/sign-out menu items are inert placeholders. Only the Inbox view is part of this exploration.

## Structure

```
poc/bootstrap-inbox/
├── index.html   markup and Bootstrap CDN links
├── styles.css   application geometry and a few visual refinements
├── script.js    mock data and interactions
└── README.md
```

## Intentional deviations from the current application

- **Selected issue on load.** The production screenshot shows an empty detail pane. ASY-1 is selected by default here so the full layout can be reviewed.
- **One coherent header.** The issue counts, search, filters, and list heading are grouped into a single compact header instead of separate toolbar layers.
- **Wider search.** The inbox search grows to fill the available width rather than staying at a fixed narrow size.
- **Document-style detail.** The right pane renders a realistic issue document (description, metadata, comments, composer) instead of an empty-state instruction.
- **Bootstrap conventions.** Dropdowns, list groups, forms, buttons, badges, the off-canvas, and the modal are stock Bootstrap components. Custom CSS is limited to layout geometry (sidebar/list widths, pane scrolling, mobile switching) and small typography/label adjustments.
- **Global search is a palette.** It searches all mock issues and jumps to a result rather than acting as a second inline filter field.
- **Repository scope is interactive.** Choosing a repository in the navbar updates the same filter state as the Filters menu.
- **Illustrative links.** "Open in GitHub" points at mock `github.com/t12n/...` URLs and is not expected to resolve.

## Notes for modifying it

- Issue content lives in the `issues` array at the top of `script.js`. Descriptions and comments are trusted HTML strings; comment input is escaped before rendering.
- New filters should be added to the `state` object, the relevant control markup, and `getVisibleIssues()`.
- Layout widths are the two `clamp()` values in `styles.css` (`.inbox-list-pane`) plus the fixed 232px sidebar at the `xl` breakpoint.
