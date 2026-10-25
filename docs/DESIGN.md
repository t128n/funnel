# DESIGN.md: Funnel application profile — Bugzilla UI/UX standards

Funnel adopts the shared [design system baseline](plans/2026-10-25-design-system-baseline.md). The baseline fixes structure, surface, state and behaviour for every web app; this document is Funnel's application profile. It narrows the baseline to an issue cockpit and never relaxes it. Where the two disagree, the baseline wins and this profile is corrected.

Funnel's interface follows modern Bugzilla (bugzilla.mozilla.org): table-first,
text-first and data-honest. These rules are binding for every Funnel surface.
Apply them while building, not as a later cleanup pass.

## 1. Core philosophy

**Density over whitespace.** Information earns its place. Tight rows, tabular
alignment and short paddings beat decorative breathing room.

**Function over polish.** A control should look like a control. No glass, no
gradients, no tinted card shells. A border and a label are usually enough.

**Everything linkable.** Every entity has a URL. Bug numbers, products,
milestones and comments are links, not spans with click handlers that cannot be
opened in a new tab.

**Transparency.** Show the real data and its state — status, resolution,
severity, who wrote what and when. Do not soften or hide inconvenient values.

## 2. Colour

One accent only: `#0060df` in light, `#8cb4ff` in dark. Links are underlined in
`--primary`. Structural contrast comes from 1px `--border` rules, never from
translucent tone or gradients.

| Token                | Light     | Dark      | Use                              |
| -------------------- | --------- | --------- | -------------------------------- |
| `--background`       | `#ffffff` | `#1c1b22` | Page canvas                      |
| `--foreground`       | `#15141a` | `#fbfbfe` | Body text                        |
| `--card`             | `#ffffff` | `#2b2a33` | Panels, comments                 |
| `--popover`          | `#ffffff` | `#2b2a33` | Menus, dialogs                   |
| `--muted`            | `#f0f0f4` | `#2b2a33` | Header cells, button fill        |
| `--muted-foreground` | `#5b5b66` | `#bfbfc9` | Labels, secondary meta           |
| `--border`           | `#cfcfd8` | `#52525e` | Every structural edge            |
| `--input`            | `#b1b1bd` | `#6f6f7b` | Field outlines                   |
| `--primary`          | `#0060df` | `#8cb4ff` | Links, primary action, selection |
| `--accent`           | `#e0eaff` | `#3a3944` | Selected row fill                |
| `--destructive`      | `#d70022` | `#ff6a75` | Errors, blockers                 |
| `--success`          | `#058b00` | `#3fe1b0` | Done, fixed                      |
| `--warning`          | `#a47f00` | `#ffd567` | Pending, review, in progress     |
| `--sidebar`          | `#f9f9fb` | `#23222a` | Sidebar canvas                   |
| `--comment-header`   | `#f0f0f4` | `#2b2a33` | Comment header bar               |
| `--comment-reporter` | `#fffbe6` | `#2e2b22` | Reporter comment tint            |
| `--radius`           | `0.25rem` | `0.25rem` | Cards and popovers only          |

Semantics: green = done/fixed, red = blocker/severity, amber =
in-progress/review/pending, grey = backlog/closed/minor. Colour goes on the
token, not on the row or the border.

## 3. Typography

System sans for prose and UI. Monospace for IDs, flags, dates and comment
bodies: `ui-monospace, "SFMono-Regular", "Cascadia Mono", "Liberation Mono",
Menlo, Consolas, monospace`.

| Name  | Size | Use                                  |
| ----- | ---- | ------------------------------------ |
| `2xs` | 10px | Counts only — the micro floor        |
| `xs`  | 11px | Table headers, labels, meta          |
| `sm`  | 13px | Body copy, table cells, comments     |
| `base` | 14px | Default form text                    |
| `lg`  | 15px | Section headings                     |
| `xl`  | 17px | Page titles                          |
| `2xl` | 20px | Rare hero figures                    |

Page title 17px/600. Table headers 11px/600 uppercase. Meta 11px. Comment
bodies mono 13px/1.55. Nothing below 11px except counts at 10px; no arbitrary
`text-[9px]` values.

## 4. Shape

- Radius `0` for cells, inputs, buttons and selects. `4px` for cards and
  popovers. Nothing above 8px.
- Every structural edge is a real 1px `var(--border)`. Rows are carried by
  1px rules and zebra striping, not by shadow or translucent tone.
- Shadows appear only on popovers and dialogs.
- Buttons look native: 1px border, `--muted` fill, 2px radius. The primary
  action is a `--primary` fill.

## 5. Chrome

Sidebar kept, de-iconised: text links only. Section labels are 11px/600
uppercase. An active item is 600 weight in `--primary` with a 3px left rule.
Counts render as `(3)`.

A footer nav repeats the primary sections as pipe-separated text links with
`Funnel 0.0.1` on the right. The mobile sheet trigger stays reachable below
`md`.

## 6. Issue page

Title: `Bug 1 – Widget grid collapses below 480px (IN PROGRESS)` at 17px/600.
A missing status renders `UNCONFIRMED`.

Then a metadata table: right-aligned 11px/600 muted labels, 13px values, 1px
rules, no pills. Rows: Status, Resolution, Product/Component, Milestone,
Priority, Severity, Size, Assignee, Reporter, Labels, Blocked, Watching, CC.
Values stay click-to-edit but render as plain text.

Then description and attachments. Then comments: `#c1` anchor, grey header bar
(author, time, `reply`), mono body, reporter tint. Internal notes get an amber
left rule and an `Internal` flag. The composer is a plain textarea with
`Save Changes`.

## 7. Lists

11px uppercase header on `--muted`, zebra rows, 1px rules. Closed rows are
struck through and muted. Severity colour appears only on the P/sev token:
priority is derived and displayed `P1`–`P3`, severity as `blocker` / `major` /
`minor`. Footer: `N bugs · Edit Search`.

## 8. Board and plan

Bordered lanes with a grey header cell (name + count). Cards: 1px border, mono
ref, title, plain token row. Drag stays, but tilt and shadow are replaced by a
2px `--primary` insertion line. Plan lanes reuse the board header cell; day
blocks become bordered rows.

## 9. Accepted distance

Bugzilla has no kanban, calendar or live updates. Board and plan keep their
function and lose the decorative chrome. The sidebar is kept against Bugzilla's
top nav (a product decision), offset by the footer nav. Priority stays derived.

## 10. Adding a surface

- Structure chrome and nav bars with `.bug-chrome`; give it a 1px `--border`
  edge and no radius.
- Render tabular data with `.bug-table` — 11px uppercase header, zebra rows,
  1px rules.
- Render label/value pairs with `.bug-meta` — right-aligned muted labels, flat
  values, no pills.
- Render discussion with `.bug-comment` — grey header bar and mono body.
- Render status, severity and internal markers with `.flag`; colour the token,
  never the row.
- Use `.link` for in-prose links: `--primary` with an underline.
- Do not introduce `--surface-*` tokens, radii above 4px on chrome, or body
  text below 13px. Check the dark theme before calling the surface done.
