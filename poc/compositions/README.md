# Funnel composition study

Three functional compositions of the same issue-management product, built with Bootstrap 5 and Sveltestrap. This is an isolated design exercise, not a production migration and not an architecture proposal.

The original standalone inbox PoC in `../bootstrap-inbox/` is untouched. This lab starts from its fixture tone and interaction model, but reconsiders the application shell, the issue index, and the issue document from first principles.

**Approved design direction: A — Traditional Bootstrap application.** The production handoff is [`../../docs/design/COMPOSITION-A.md`](../../docs/design/COMPOSITION-A.md) and [`../../docs/design/MIGRATION-MAP.md`](../../docs/design/MIGRATION-MAP.md). The analytical comparison remains in [`COMPARISON.md`](COMPARISON.md).

## Run it

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:4173/`. The index links to all three compositions.

For a production build:

```sh
npm run build
npm run preview
```

The app loads Bootstrap, Bootstrap Icons, Svelte, and Sveltestrap from local dependencies. There is no CDN dependency and no backend.

## The three compositions

| | Route | Composition |
| --- | --- | --- |
| **A** | `/#/a/issues` | **Traditional Bootstrap application.** Compact dark navbar, centered page container, grouped table, dedicated document page with a properties card. |
| **B** | `/#/b/issues/FUN-58` | **Compact master-detail workspace.** Subdued 208px sidebar, 340px dense issue list, flexible document pane, inline text metadata. |
| **C** | `/#/c/issues` | **List-first issue management.** Light top navbar, full-width eight-column table, dedicated document page, compact metadata bar, inline inbox triage. |

Inbox routes are `/#/a/inbox`, `/#/b/inbox`, and `/#/c/inbox`. Any issue can be opened at `/#/<variant>/issues/<issue-id>`.

## Shared data and behavior

`src/lib/fixtures.js` contains 20 issues across `funnel`, `assay`, `forges.link`, and `intake`:

- 16 issues in the normal issue index.
- Four untriaged submissions in Inbox.
- Realistic statuses, priorities, sizes, assignees, milestones, labels, epics, sources, and submitters.
- A complete issue document with headings, paragraphs, ordered and unordered lists, inline code, fenced code, a blockquote, and a table.
- Comments and activity events for every issue.

All three variants share the same fixture file and each gets its own in-memory workspace, so interactions in one composition do not affect another.

Working behavior in every variant:

- Full-text search across titles, IDs, bodies, labels, people, and comments.
- Repository, status, priority, assignee, and milestone filters.
- Grouping by status, priority, assignee, or nothing.
- Editable status, priority, assignee, and milestone.
- Comment composer with Cmd/Ctrl+Enter.
- Global search panel with keyboard navigation.
- Inbox Accept and Decline that update the issue index and counts.
- Responsive list, detail, inbox, and navigation behavior.

State is intentionally in memory. Reloading resets the fixture data.

## Screenshots

All desktop captures are **1440 × 900**; all mobile captures are **390 × 844**. They live in `screenshots/`.

| Desktop | Mobile |
| --- | --- |
| `desktop-index.png` | |
| `desktop-a-issues.png`, `desktop-a-issue.png`, `desktop-a-activity.png`, `desktop-a-inbox.png` | `mobile-a-issues.png`, `mobile-a-issue.png`, `mobile-a-inbox.png` |
| `desktop-b-issues.png`, `desktop-b-activity.png`, `desktop-b-inbox.png` | `mobile-b-issues.png`, `mobile-b-issue.png`, `mobile-b-inbox.png`, `mobile-b-inbox-detail.png` |
| `desktop-c-issues.png`, `desktop-c-issue.png`, `desktop-c-activity.png`, `desktop-c-inbox.png` | `mobile-c-issues.png`, `mobile-c-issue.png`, `mobile-c-inbox.png` |

## Verify it

```sh
npm test
```

The Playwright suite checks navigation, search, filters, grouping, empty states, metadata edits, comments, inbox triage, global search, and 390px behavior in all three compositions.

```sh
npm run shots    # recapture all screenshots
npm run measure  # print layout measurements used in COMPARISON.md
```

If Playwright has no browser available, run `npx playwright install chromium` once.

## Implementation notes

- Vite 5, Svelte 4.2.20, Sveltestrap 5.11.3, Bootstrap 5.3.8, Bootstrap Icons 1.13.2.
- Svelte 4 is intentional: Sveltestrap 5.11.3 still publishes a Svelte 3 peer range. `.npmrc` sets `legacy-peer-deps=true` so the library can be evaluated in a modern Vite setup. This is a PoC dependency constraint, not a recommendation about the production framework version.
- Light theme only. Dark mode is a separate axis and would not help compare composition.
- Custom CSS is limited to layout geometry: `src/styles/app.css` is 94 lines and 22 selectors. Colors, type, spacing, borders, forms, tables, dropdowns, and badges come from Bootstrap.
- `PropertyDropdown.svelte`, `IssueBody.svelte`, `IssueTimeline.svelte`, and `SearchPalette.svelte` are feature components shared by the variants. There is no design-system layer, token file, or wrapper around Bootstrap components.

## Deliberate limits

- Board, Matrix, Plan, Timeline, and Settings are represented in navigation but outside this study. They show an explicit placeholder rather than pretending to be complete.
- No persistence, backend, authentication, permissions, or real GitHub calls.
- The GitHub links point at mock `t12n` repository URLs.
- The screenshots and comparison are the stop condition. No production route, shared component, or global style was changed.
