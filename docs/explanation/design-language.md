# Design language

Funnel tracks work that lives in a forge, and its interface takes its cues from the oldest public issue
tracker in daily use: Bugzilla. The previous look borrowed Linear's spacing and JetBrains Islands'
translucent surfaces — pleasant on a marketing page, expensive on a screen whose job is to answer what is
broken, who owns it, and what changed. The bet is that a bug tracker should read like a record.

## Density is the feature

A maintainer scanning forty issues cares about how many fit on screen, not how much air surrounds each
one. Tight rows, tabular alignment and short paddings put more decisions in one glance. Whitespace that
once signalled calm now signals distance: the further apart two values sit, the more eye travel it takes
to compare them. Density is also honesty — a list that shows twenty rows is telling you it has twenty,
while a padded card grid makes the same data feel curated and incomplete.

Three commitments follow. **Function over polish**: a control looks like a control, with a border and a
label, not a glass panel with a gradient. **Everything linkable**: a bug number, product, milestone or
comment is an anchor with a URL, so it opens in a new tab and pastes into chat. **Transparency**: status,
resolution, severity and authorship are shown as data, including the inconvenient values.

## One accent, two themes

A single accent carries every link and primary action. Structure comes from 1px `--border` rules, never
from translucent tone, so a row reads the same whether it sits on the page canvas or inside a card.

| Token                | Light     | Dark      |
| :------------------- | :-------- | :-------- |
| `--background`       | `#ffffff` | `#1c1b22` |
| `--foreground`       | `#15141a` | `#fbfbfe` |
| `--card`             | `#ffffff` | `#2b2a33` |
| `--popover`          | `#ffffff` | `#2b2a33` |
| `--muted`            | `#f0f0f4` | `#2b2a33` |
| `--muted-foreground` | `#5b5b66` | `#bfbfc9` |
| `--border`           | `#cfcfd8` | `#52525e` |
| `--input`            | `#b1b1bd` | `#6f6f7b` |
| `--primary`          | `#0060df` | `#8cb4ff` |
| `--accent`           | `#e0eaff` | `#3a3944` |
| `--destructive`      | `#d70022` | `#ff6a75` |
| `--success`          | `#058b00` | `#3fe1b0` |
| `--warning`          | `#a47f00` | `#ffd567` |
| `--sidebar`          | `#f9f9fb` | `#23222a` |
| `--comment-header`   | `#f0f0f4` | `#2b2a33` |
| `--comment-reporter` | `#fffbe6` | `#2e2b22` |
| `--radius`           | `0.25rem` | `0.25rem` |

Green means done or fixed, red means blocker or severity, amber means in progress, review or pending,
and grey means backlog, closed or minor. Colour goes on the token, never on the row behind it.

## Type and shape

The system sans stack sets prose and UI; monospace sets IDs, flags, dates and comment bodies. The scale
runs 10 / 11 / 13 / 14 / 15 / 17 / 20px. Ten pixels is the micro floor and only counts use it. Page titles
are 17px/600, table headers 11px/600 uppercase, meta 11px, comment bodies 13px/1.55.

Cells, inputs, buttons and selects have no radius; cards and popovers get 4px; nothing exceeds 8px. Every
structural edge is a real 1px border. Shadows appear only on popovers and dialogs, where they signal a
layer above the page rather than decoration. Buttons look native: 1px border, muted fill, 2px radius,
with the primary action filled in the accent.

## The issue page

The page opens with the record's identity: `Bug 1 – Widget grid collapses below 480px (IN PROGRESS)` at
17px/600, with a missing status rendered as `UNCONFIRMED`. Beneath it sits a metadata table — right-aligned
11px/600 muted labels and 13px values separated by 1px rules. Status, resolution, product/component,
milestone, priority, severity, size, assignee, reporter, labels, blocked, watching and CC are all rows.
There are no pills. A value is still click-to-edit, but at rest it is plain text, so the table compares
like a table.

Discussion is numbered and monospaced. Each comment carries a `#c1` anchor and a grey header bar with
author, time and a `reply` link; the body is monospace at 13px with preserved whitespace, which keeps
pasted logs and stack traces readable. Reporter comments take a warm tint, and internal notes get an
amber left rule with an `Internal` flag. The composer is a plain textarea and a `Save Changes` button.

## What board and plan keep

Bugzilla has no kanban board and no calendar, and Funnel keeps both anyway. They are not borrowed chrome;
they answer questions the issue list cannot — what is in flight across statuses, and what one person can
finish this week. The pivot changes how they look, not what they do. Lanes are bordered with a grey header
cell holding the name and count. Cards keep a 1px border, a monospace reference, a title and a plain token
row. Dragging still works, but the lift-and-tilt is replaced by a 2px accent insertion line that states
where the card will land.

## The gallery

Ten views, before and after, captured on the same seeded data and viewport. The "before" halves come from
the unmodified tree; `issue-activity` and `board` also carry dark pairs, showing the theme is a palette swap.

**Issues.** A table with an 11px uppercase header on muted, zebra rows and 1px rules. Closed rows are
struck through, and severity colour appears only on the `P1`–`P3` and severity token.

| Before | After |
| :--- | :--- |
| ![issues before](../assets/design-pivot/before/issues-light.png) | ![issues after](../assets/design-pivot/after/issues-light.png) |

**Issue detail.** The title states bug number, title and status in one line, followed by the metadata
table. The inspector is no longer a stack of cards with pill values.

| Before | After |
| :--- | :--- |
| ![issue before](../assets/design-pivot/before/issue-light.png) | ![issue after](../assets/design-pivot/after/issue-light.png) |

**Issue activity.** Comments are numbered `#cN`, headered in grey and set in monospace, with the reporter
tint and an amber rule for internal notes.

| Before | After |
| :--- | :--- |
| ![issue activity before](../assets/design-pivot/before/issue-activity-light.png) | ![issue activity after](../assets/design-pivot/after/issue-activity-light.png) |

| Before (dark) | After (dark) |
| :--- | :--- |
| ![issue activity before, dark](../assets/design-pivot/before/issue-activity-dark.png) | ![issue activity after, dark](../assets/design-pivot/after/issue-activity-dark.png) |

**Board.** Bordered lanes with a grey header cell; cards are flat and token-only, and the insertion line
replaces the tilt.

| Before | After |
| :--- | :--- |
| ![board before](../assets/design-pivot/before/board-light.png) | ![board after](../assets/design-pivot/after/board-light.png) |

| Before (dark) | After (dark) |
| :--- | :--- |
| ![board before, dark](../assets/design-pivot/before/board-dark.png) | ![board after, dark](../assets/design-pivot/after/board-dark.png) |

**Plan.** Plan lanes reuse the board's header cell and day blocks become bordered rows, so intent and
capacity read as a schedule rather than a set of floating chips.

| Before | After |
| :--- | :--- |
| ![plan before](../assets/design-pivot/before/plan-light.png) | ![plan after](../assets/design-pivot/after/plan-light.png) |

**Epics.** Epics keep their rollup figures but present children as a bordered table; avatars drop out of
list rows and every action stays.

| Before | After |
| :--- | :--- |
| ![epics before](../assets/design-pivot/before/epics-light.png) | ![epics after](../assets/design-pivot/after/epics-light.png) |

**Milestones.** Names, dates and progress are a plain table with links underlined in the accent, not
cards.

| Before | After |
| :--- | :--- |
| ![milestones before](../assets/design-pivot/before/milestones-light.png) | ![milestones after](../assets/design-pivot/after/milestones-light.png) |

**Attention.** Rows are zebra table rows; urgency colour sits on its token and the re-check date is
monospace, so the page scans as a work queue.

| Before | After |
| :--- | :--- |
| ![attention before](../assets/design-pivot/before/attention-light.png) | ![attention after](../assets/design-pivot/after/attention-light.png) |

**Inbox.** Submissions use the issue list primitives, so triage is the same gesture everywhere: read a
row, open a link, change a value.

| Before | After |
| :--- | :--- |
| ![inbox before](../assets/design-pivot/before/inbox-light.png) | ![inbox after](../assets/design-pivot/after/inbox-light.png) |

**Settings — appearance.** Theme and density controls become native radios and labels, matching the rest
of the application instead of previewing themselves in cards.

| Before | After |
| :--- | :--- |
| ![settings appearance before](../assets/design-pivot/before/settings-appearance-light.png) | ![settings appearance after](../assets/design-pivot/after/settings-appearance-light.png) |

## Recapturing

The pairs are reproducible rather than curated. `scripts/screenshots/README.md` documents the harness:
seed a throwaway database, then capture all ten views in both themes from the same data.

```sh
COOKIE="$(bun scripts/screenshots/seed.ts --out /tmp/funnel-shots)"
FUNNEL_DB=/tmp/funnel-shots/funnel.db \
FUNNEL_SECRET=funnel-screenshots-secret-0123456789abcdef \
bun scripts/screenshots/capture.ts --out /tmp/funnel-shots/out --cookie "$COOKIE"
```

Copy the `<view>-<light|dark>.png` files into `before/` or `after/` depending on which tree you captured.
If only one surface moved, recapture that view; `docs/assets/design-pivot/README.md` maps files to pages.

## Related

- [Design system baseline](../plans/2026-10-25-design-system-baseline.md) — the cross-app rules this Funnel profile implements.
- [Funnel application profile](../DESIGN.md) — the exact tokens, status mapping and surface rules for this app.
- [Design principles](./design-principles.md) — the reasoning behind the baseline and the profile.
