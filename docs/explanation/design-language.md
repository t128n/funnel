# Design language

Funnel is an issue cockpit: a place to answer what is broken, who owns it, and
what fits in the week. Its interface follows **Bootstrap 5** and uses
**Sveltestrap** for Svelte component abstractions and **Bootstrap Icons** for
iconography. The visual language is deliberately quiet; the data is the
interface.

The application profile is [DESIGN.md](../DESIGN.md). Bootstrap CSS and
Bootstrap Icons are loaded once in
[`src/routes/+layout.svelte`](../../src/routes/+layout.svelte); application
layout rules live in [`app.css`](../../src/lib/styles/app.css).

## Bootstrap, not a bespoke system

Funnel previously maintained its own generic component layer on top of
Tailwind, shadcn-svelte, and bits-ui. That layer has been removed. Buttons,
forms, tables, navigation, dialogs, dropdowns, alerts, badges, progress, and
spinners now come from Bootstrap and Sveltestrap. Domain components such as the
issue inspector, board, matrix, and timeline remain because they encode product
behavior, but they compose Sveltestrap rather than maintaining parallel
generic primitives.

Using the established library keeps the application recognizable, reduces the
surface Funnel owns, and makes light/dark mode, focus handling, and keyboard
behavior consistent by default.

## Density with air where it matters

A maintainer scanning forty issues needs comparison, not decoration. The app
shell is one compact dark navbar over a centered page: there is no persistent
sidebar and no split list/detail pane. The issue index is a grouped six-column
table; the document is its own page. Index titles are ordinary blue links with
metadata as icon + text. Density is carried by alignment, rules, and Bootstrap
spacing, not by shrinking type.

Whitespace does the grouping. A page title, a single toolbar row, the table,
and its footer follow one another with Bootstrap spacing. There are no cards
around data. A table is the page structure. Cards are reserved for the issue's
Properties and Details rail.

## One theme mechanism

Light and dark are complete Bootstrap themes driven by `data-bs-theme` on
`<html>`. The navbar stays dark in both themes. Status colours (danger,
warning, success) are text and icons; colour is never the only channel.
Components use Bootstrap CSS variables such as `--bs-body-color`,
`--bs-border-color`, and `--bs-primary`, so they follow the active theme
without a second token system.

## The issue page

The record is a dedicated route. It opens with a breadcrumb, the repository and
monospace reference, the title as a page heading, and a status/labels/opened/
updated line. An eight-column document holds the description, activity, work
notes, attachments, and composer; a four-column rail holds the Properties and
Details cards. Properties edits commit immediately and append an activity
event.

Description and comments read as a document at 1rem/1.65 with Bootstrap prose
and code blocks. Activity is a ruled list, not chat bubbles.

## Board, matrix, and plan

The board keeps its kanban function with flat Bootstrap cards, 1px borders, a
mono ref, and icon+text status. Dragging still works, and every drag has a
keyboard and menu equivalent. The matrix is an interactive 3×3 selection grid
inside `container-xl`, with an assessment summary above it, a rating-guide
dialog, and the selected cell's issue list in the second column; issues missing
an axis stay in the assessment queue. Plan is a conventional document view: a
capacity table followed by scheduled, unassigned and unestimated tables, with
no progress meters or dashboard cards. These layouts keep small scoped
stylesheets only where their geometry is specific to the task; their colors and
typography still come from Bootstrap.

The timeline is an Apache ECharts canvas with an HTML label column and a
separate undated table. It reads its palette from `--funnel-chart-*` and
Bootstrap variables so it follows the theme.

## Focused flows

Intake, login, and onboarding use a centered column with no navigation, one
primary action, and Bootstrap form controls. They share the same visual
language as the cockpit without the application frame.
