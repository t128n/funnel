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
shell uses a compact dark navbar and a light `bg-body-tertiary` sidebar with
30 px navigation rows and a quiet neutral active state. Dense list titles are
14 px, metadata is 12 px, and identifiers are ordinary blue links. Tables use
Bootstrap `table-sm`, and every metadata column keeps its slot. Density is
carried by alignment and rules, not by shrinking type.

Whitespace does the grouping. A page title is separated from its toolbar by a
rule, a toolbar from its table by a rule, and a table from its footer by a
rule. There are no cards around data. A table is the page structure.

## One theme mechanism

Light and dark are complete Bootstrap themes driven by `data-bs-theme` on
`<html>`. The navbar stays dark in both themes. Status colours (danger,
warning, success) are text and icons; colour is never the only channel.
Components use Bootstrap CSS variables such as `--bs-body-color`,
`--bs-border-color`, and `--bs-primary`, so they follow the active theme
without a second token system.

## The issue page

The record opens with its identity: ref in monospace, title as a page heading,
and a status/priority/assignee line. Properties are label–value rows under a
top rule; edit controls are conventional Bootstrap selects and dropdowns.

Description and comments use Bootstrap prose capped at a comfortable reading
measure. Activity is a ruled list, not chat bubbles. Work notes and
attachments sit inline after activity. The composer closes the page with
comment/internal-note modes, attachments, and a primary submit.

## Board, matrix, and plan

The board keeps fixed-width Bootstrap cards in horizontally scrollable lanes.
The matrix is a fixed-layout Bootstrap table so all five columns fit and titles
truncate. The plan uses ruled maintainer lanes and Bootstrap progress meters.
These layouts keep small scoped stylesheets because their geometry is specific
to the task; their colors and typography still come from Bootstrap.

The timeline is an Apache ECharts canvas with an HTML label column and a
separate undated table. It reads its palette from `--funnel-chart-*` and
Bootstrap variables so it follows the theme.

## Focused flows

Intake, login, and onboarding use a centered column with no navigation, one
primary action, and Bootstrap form controls. They share the same visual
language as the cockpit without the application frame.
