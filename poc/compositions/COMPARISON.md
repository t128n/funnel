# Composition comparison

## The question

The current Funnel UI stacks a dark global navbar, a 232px persistent sidebar, a narrow issue list, and a detail pane. The migration to Bootstrap and Sveltestrap made that structure more consistent, but it did not test whether the structure itself is necessary.

This study holds the fixture data and behavior constant and changes the composition. It compares:

- **A — Traditional Bootstrap application:** dark navbar, centered pages, grouped table, dedicated document page with a properties card.
- **B — Compact master-detail workspace:** subdued sidebar, dense list, adjacent document pane, inline metadata.
- **C — List-first issue management:** light navbar, full-width eight-column index, dedicated document page, inline metadata.

Evaluation is based on the same 20 fixtures, the same interactions, and the same screen sizes. It deliberately does not reward the newest-looking option.

## Selection record

**Approved design direction: A — Traditional Bootstrap application.**

- **Decision date:** 2026-11-03.
- **Analytical result:** C scored highest (36), A second (32), B third (27). That result is preserved below and is not being rewritten.
- **Selection basis:** product preference for A’s conventional application shell, dark global navbar, centered page grid, dedicated document page, and Properties card. A also preserves the widest title column of the three compositions.
- **Accepted trade-offs:** A exposes six scan fields rather than C’s eight, uses a centered container that leaves gutters on very wide screens, and gives up C’s analytical advantages in scanability and implementation simplicity.
- **Not reopened:** the comparison itself, the C and B analyses, or the PoC. Composition A is the baseline. The production handoff is specified in [`docs/design/COMPOSITION-A.md`](../../docs/design/COMPOSITION-A.md) and [`docs/design/MIGRATION-MAP.md`](../../docs/design/MIGRATION-MAP.md).

## Method and measurements

Desktop captures are 1440 × 900. Mobile captures are 390 × 844. Rows are counted only when their full bounding box fits inside the viewport in the default grouped state with no filters.

| Measurement | A | B | C |
| --- | ---: | ---: | ---: |
| Persistent navigation | 56px top navbar | 208px sidebar + 44px workspace bar | 57px top navbar |
| Issue index surface | 1,294px table | 340px list | 1,390px table |
| Title column / title area | 654px | ~300px of list text | 470px |
| Fully visible issue rows | 12 | 6 | 12 |
| Approximate row height | 41px | 92–116px | 41px |
| Scan fields per row | ID, title, status, priority, assignee, updated | ID, time, title, priority, repo, assignee | ID, title, status, priority, size, assignee, milestone, updated |
| Detail placement | Dedicated page, 8/4 split | Adjacent 892px pane | Dedicated page, 72ch measure |
| Custom layout CSS | 94 lines shared by all three | 94 lines shared by all three | 94 lines shared by all three |
| Responsive model | Natural page reflow | List/detail state switch, off-canvas nav | Natural page reflow |
| Interaction shape | List → page → list | List ↔ adjacent detail | List → page → list |

The custom CSS number is the whole `src/styles/app.css` file, not one variant. It covers the split-pane geometry, row cursor, document measure, and mobile switching. There is no variant-specific stylesheet and no token layer.

## Criteria

Scores are 1–5, higher is better. For interaction complexity, 5 means the fewest steps.

| Criterion | A | B | C | Evidence |
| --- | ---: | ---: | ---: | --- |
| Information density | 4 | 3 | 5 | A shows 12 rows × 6 fields. B shows 6 rows with six inline facts each, plus adjacent detail. C shows 12 rows × 8 fields. |
| Scanability | 4 | 3 | 5 | C has the broadest index and the most scan fields. A has the widest titles. B’s two- to three-line rows are read serially. |
| Content hierarchy | 4 | 3 | 5 | A and C give the document its own page. B’s list and sidebar remain visually present around the document. |
| Navigation efficiency | 4 | 5 | 3 | B never leaves context. A and C require a return step when moving between issues. |
| Visual restraint | 4 | 3 | 5 | C uses the fewest persistent regions and the quietest chrome. A’s dark navbar is prominent. B has three persistent regions. |
| Interaction complexity | 4 | 5 | 3 | B is one click per issue. A and C add a page transition. Metadata edits are comparable in all three. |
| Implementation simplicity | 4 | 2 | 5 | A and C use ordinary pages and tables. B adds pane widths, independent scrolling, list/detail state, and off-canvas navigation. |
| Responsive behavior | 4 | 3 | 5 | A and C reflow naturally. B needs an explicit mobile list/detail switch and a second navigation surface. |
| **Total** | **32** | **27** | **36** | |

## Alternative A — Traditional Bootstrap application

**Strengths**

- The most conventional interpretation of the reference: blue links, a grouped table, stock buttons, forms, cards, and a compact dark navbar.
- The widest title column of the three at 654px. Long issue titles rarely wrap.
- One navigation layer. The page container and document page have an obvious reading order.
- Twelve fully visible rows despite the page header, because the table is efficient.
- Detail reading is calm: an eight-column document, a four-column properties card, and comments below.

**Weaknesses**

- The centered 1,320px container leaves gutters at 1440px, while the table only exposes six fields.
- The properties card reintroduces a second column and four form controls. The document is no longer the only focus on the page.
- Size and milestone are not visible in the index, so scanning for planning context requires opening issues.
- The dark navbar is the strongest visual object on the page. It frames the application more than the work.
- The conventional page header, breadcrumb, and card structure is clear but slightly ceremonial for a repeated issue workflow.

**Best fit:** teams that value familiarity, the widest possible titles, and a clean document page over maximum metadata in the index.

## Alternative B — Compact master-detail workspace

**Strengths**

- The fastest issue-to-issue workflow. Selecting an issue never destroys the list, and the next issue is one click away.
- Reading and commenting happen next to the list, with no route change or back step.
- Metadata is a single quiet line of text dropdowns. It is the least visually heavy metadata treatment in the study.
- The Inbox split view makes triage feel deliberate: the list provides queue context, the pane provides the submission.
- The 208px sidebar is visibly quieter than the current application’s navigation and uses a flat destination list.

**Weaknesses**

- Three persistent regions: 208px sidebar, 340px list, flexible detail. The detail is 892px wide, but only six issue rows are fully visible at 900px.
- The title is not a column. Long titles wrap to two or three lines and the list becomes serial rather than scannable.
- The sidebar still occupies an entire column for seven destinations, and the workspace bar adds a second navigation layer.
- It needs the most custom layout infrastructure: fixed pane widths, two independent scroll contexts, a mobile list/detail switch, and an off-canvas duplicate of the sidebar.
- The list and detail compete for attention. The document is centered and readable, but it never owns the screen.
- The layout is the least natural at narrow widths because the composition, not just the content, has to change.

**Best fit:** teams with a measured pattern of reading and commenting across many consecutive issues, where context retention is worth the scanning breadth.

## Alternative C — List-first issue management

**Strengths**

- The strongest index. Twelve fully visible rows and eight scan fields: ID, title, status, priority, size, assignee, milestone, and updated.
- Issue content gets a dedicated 72ch document page with no persistent list, navigation rail, or second pane competing for space.
- Full-width table at 1,390px. The page header and one filter row are the only chrome above the work.
- Inbox triage is inline: Accept and Decline happen in the row, and the mobile view becomes a clean card list rather than a squeezed table.
- The responsive behavior is natural. Columns disappear, a secondary metadata line appears, and the document stacks. There is no list/detail state machine.
- The least layout code and the fewest persistent regions.

**Weaknesses**

- Browsing five issues in a row costs five returns to the index. B does not have that cost.
- The title column is 470px, narrower than A’s 654px, because the table carries more metadata. Titles wrap more than in A.
- Metadata is only editable on the detail page, so a user cannot change status while scanning the queue.
- Full-width tables can feel “index-like” rather than workspace-like. The visual hierarchy is deliberately flat.
- At 1440px, short groups leave empty horizontal space below the table, just as A does. This is a consequence of a broad list, not a layout defect.

**Best fit:** teams whose primary job is scanning, prioritizing, and working a broad queue, with detail as a focused reading and commenting surface.

## Analytical recommendation

**The criteria produce C: list-first issue management.**

C wins on the criteria that matter most for scanning and maintainability: it exposes the most useful issue metadata per screen, gives the issue document an unambiguous home, adapts to narrow screens without inventing a second navigation model, and requires the least layout infrastructure to maintain.

The WARC Specifications site is a reading reference, not a layout to copy. What transfers is the quiet chrome, conventional blue links, generous reading measure, and the absence of decorative containers around content. C applies that to the issue document and keeps the index utilitarian where the workflow needs scanning rather than reading.

The decisive evidence is:

- 12 fully visible rows × 8 fields versus A’s 12 × 6 and B’s 6 rows with six inline facts each.
- A document page with a 72ch measure and no persistent pane competition.
- One navigation layer and one responsive model.
- Inline inbox triage that works the same way on desktop and mobile.
- 94 lines of layout CSS shared by all three, with C using no split-pane state.

If C had been approved, it would have carried conventional blue links, grouped table rows, restrained document typography, and stock Bootstrap controls from A, plus the compact inline metadata control treatment from B.

**B remains the analytical answer if** telemetry shows that most sessions involve reading or commenting on five or more consecutive issues without leaving the list. That is the one assumption that could justify the master-detail cost.

## Approved selection

**A — Traditional Bootstrap application is the approved design direction.**

The selection is a product decision, not a reversal of the criteria result. A was chosen for its conventional application shell, dark navbar, centered page composition, dedicated document page, Properties card, and the widest title column. Those are the qualities the product owner wants to preserve.

The approved baseline is Composition A exactly as demonstrated in the PoC:

- Dark top navbar, one navigation layer, no persistent sidebar.
- Centered `container-xl` issue index and inbox.
- Grouped six-column issue table.
- Dedicated issue page with an eight-column document and four-column properties/details rail.
- Conventional form-select metadata editing in the Properties card.
- Conventional inbox table with inline Accept and Decline.

The compact inline metadata treatment from B and the eight-column index from C are **not** part of the approved A baseline. They remain comparison findings, not requirements.

The authoritative implementation handoff is [`docs/design/COMPOSITION-A.md`](../../docs/design/COMPOSITION-A.md). Route and component mapping is in [`docs/design/MIGRATION-MAP.md`](../../docs/design/MIGRATION-MAP.md).

## Appendix: analytical C implementation surface (not selected)

This section is retained only to preserve the comparison. It is not the approved migration plan and must not be implemented as written.

### Layout and navigation

- Remove the persistent 232px **sidebar** from issue, inbox, and detail routes. Move primary navigation into the top navbar, with the existing off-canvas behavior below `lg`.
- Delete the sidebar layout wrapper, backdrop, and its pane-specific CSS.
- Make the app shell a normal document shell for issue routes. The shell should not reserve a fixed list or detail column.

### Routes

- `/issues` becomes the full-width grouped issue index.
- `/issues/:id` becomes the dedicated issue document route.
- Remove selected-issue-in-pane state, the `detail-open` mobile state, and the route logic that keeps list and detail synchronized.
- Preserve deep links and browser back behavior. Update any existing route tests and analytics event names.

### Issue index

- Replace the split list with a grouped Bootstrap table.
- Use the current table columns as the starting set: ID, title, status, priority, size, assignee, milestone, updated.
- Hide secondary columns below `md` and render a compact metadata line inside the title cell. Do not make the user horizontally scroll the table for normal work.
- Keep row keyboard navigation and add a real title link for keyboard and middle-click behavior.
- Keep group header rows and the existing grouping control.

### Filters and toolbar

- Collapse search, status, priority, assignee, grouping, and the advanced filter affordance into one row.
- Move milestone and other less frequent filters into a “More” dropdown or off-canvas panel.
- Remove the second toolbar row that currently separates the scope controls from the group controls.
- Keep the active-filter count and a single clear action.

### Issue detail

- Remove the always-visible row of metadata pills/dropdowns.
- Use one compact metadata bar for status, priority, assignee, and milestone. The B treatment is the reference.
- Keep the issue document at a 72ch measure. Do not add a persistent right-hand properties rail.
- Keep activity and comments below the document.
- Retain the inline triage bar when an untriaged submission is opened directly.
- Keep the secondary facts (repo, epic, size, labels, opened, updated) as a single small line, not a card.

### Inbox

- Replace the split triage view with a wide queue table on desktop and stacked rows on mobile.
- Keep Accept and Decline inline. Add assignment as an inline control if the queue needs it.
- Remove the selected-inbox detail state and the corresponding pane CSS.
- Keep the empty state and the clear count.

### Components and CSS to retire

- Split-pane list/detail wrapper and its width rules.
- Independent list and detail scroll containers.
- Sidebar shell component and sidebar navigation CSS.
- Always-visible issue properties card and pill row.
- Mobile `detail-open` switching.
- Any layout CSS that exists only to make the three-column shell work.

Reuse rather than rebuild:

- `IssueBody` content rendering and document typography.
- `IssueTimeline` comments and activity.
- `PropertyDropdown` or its production equivalent for compact metadata.
- Global search panel.
- Bootstrap table, badge, dropdown, form, and icon primitives.

### Tests and validation

- Update route tests for the dedicated detail page.
- Update keyboard tests to cover row links and focus restoration after returning from detail.
- Add responsive tests for hidden columns and the mobile metadata line.
- Add inbox tests for inline triage and assignment.
- Replace screenshot assertions that encode pane widths with content and state assertions.
- Measure issue-to-issue transitions before and after migration. If the rate of consecutive issue reads is high enough, revisit B before committing.

### Risks

- The main product risk of the C option was losing one-click issue-to-issue browsing. That trade-off was part of the comparison and was superseded by the A selection.
- Changing the detail route can break bookmarks, notifications, and external links. Keep redirects and stable issue URLs.
- A wide table can become cramped on small laptops. The column-hiding rules need to be tested at 1024px and 1280px, not only 390px and 1440px.
- Removing the properties card reduces visible metadata on the detail page. The compact metadata bar must remain keyboard accessible and clearly editable.
- The table must not regress screen-reader semantics. Use a real table, real headers, and real links rather than clickable `tr` elements alone.

## Evidence

Desktop issue indexes:

- [A — traditional application](screenshots/desktop-a-issues.png)
- [B — compact workspace](screenshots/desktop-b-issues.png)
- [C — list-first index](screenshots/desktop-c-issues.png)

Desktop documents:

- [A — document and properties card](screenshots/desktop-a-issue.png)
- [B — adjacent document](screenshots/desktop-b-issues.png)
- [C — dedicated document](screenshots/desktop-c-issue.png)

Activity and comments:

- [A](screenshots/desktop-a-activity.png)
- [B](screenshots/desktop-b-activity.png)
- [C](screenshots/desktop-c-activity.png)

Inbox:

- [A](screenshots/desktop-a-inbox.png)
- [B](screenshots/desktop-b-inbox.png)
- [C](screenshots/desktop-c-inbox.png)

Mobile:

- [A issues](screenshots/mobile-a-issues.png), [A document](screenshots/mobile-a-issue.png), [A inbox](screenshots/mobile-a-inbox.png)
- [B list](screenshots/mobile-b-issues.png), [B document](screenshots/mobile-b-issue.png), [B inbox](screenshots/mobile-b-inbox.png), [B triage detail](screenshots/mobile-b-inbox-detail.png)
- [C issues](screenshots/mobile-c-issues.png), [C document](screenshots/mobile-c-issue.png), [C inbox](screenshots/mobile-c-inbox.png)

## Stop condition

The comparison is complete and Composition A has been selected. The design handoff in `docs/design/` is the implementation source of truth. No production route, shared component, global style, or migration has been changed.
