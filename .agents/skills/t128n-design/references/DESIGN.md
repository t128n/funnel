---
version: alpha
name: t128n
description: Personal, utility-first visual language for software applications and websites.
colors:
  canvas: "#FFFFFF"
  canvas-dark: "#161616"
  surface: "#F2F4F8"
  surface-dark: "#262626"
  surface-2: "#DDE1E6"
  surface-2-dark: "#393939"
  surface-3: "#E8EBEE"
  surface-3-dark: "#303030"
  border-subtle: "#DDE1E6"
  border-subtle-dark: "#393939"
  border-strong: "#7A7A7A"
  text-primary: "#161616"
  text-primary-dark: "#F2F4F8"
  text-secondary: "#525252"
  text-secondary-dark: "#C6C6C6"
  text-muted: "#6F6F6F"
  text-muted-dark: "#8D8D8D"
  text-disabled: "#A8A8A8"
  text-disabled-dark: "#525252"
  primary: "#0F62FE"
  primary-dark: "#33B1FF"
  primary-hover: "#0353E9"
  primary-hover-dark: "#78A9FF"
  on-primary: "#FFFFFF"
  on-primary-dark: "#161616"
  accent-on-dark: "#33B1FF"
  app-bar: "#161616"
  app-bar-dark: "#262626"
  app-bar-raised: "#262626"
  app-bar-raised-dark: "#393939"
  app-bar-text: "#F2F4F8"
  app-bar-text-secondary: "#C6C6C6"
  app-bar-divider: "#393939"
  error: "#DA1E28"
  error-dark: "#FF8389"
  error-hover: "#B81922"
  error-hover-dark: "#FF6B72"
  on-error: "#FFFFFF"
  on-error-dark: "#161616"
  warning: "#8A5A00"
  warning-dark: "#F1C21B"
  success: "#0E6027"
  success-dark: "#42BE65"
  chart-1: "#0F62FE"
  chart-1-dark: "#33B1FF"
  chart-2: "#0E6027"
  chart-2-dark: "#42BE65"
  chart-3: "#EE5396"
  chart-3-dark: "#FF7EB6"
  chart-4: "#673AB7"
  chart-4-dark: "#BE95FF"
  chart-5: "#37474F"
  chart-5-dark: "#82CFFF"
  chart-6: "#8A5A00"
  chart-6-dark: "#F1C21B"
typography:
  caption:
    fontFamily: Geist Sans
    fontSize: 0.75rem
    fontWeight: 400
    lineHeight: 1.5
  body:
    fontFamily: Geist Sans
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
  body-content:
    fontFamily: Geist Sans
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.6
  body-strong:
    fontFamily: Geist Sans
    fontSize: 0.875rem
    fontWeight: 600
    lineHeight: 1.5
  heading-sm:
    fontFamily: Geist Sans
    fontSize: 1.25rem
    fontWeight: 600
    lineHeight: 1.3
  heading-md:
    fontFamily: Geist Sans
    fontSize: 1.5rem
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.01em
  heading-lg:
    fontFamily: Geist Sans
    fontSize: 2rem
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.02em
  mono:
    fontFamily: Geist Mono
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.5
rounded:
  none: 0px
  sm: 0.125rem
  md: 0.25rem
  lg: 0.375rem
  full: 999px
spacing:
  base: 0.25rem
  xs: 0.25rem
  sm: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  2xl: 2rem
  3xl: 3rem
  4xl: 4rem
  page-desktop: 1.5rem
  page-mobile: 1rem
  control-sm: 1.75rem
  control-md: 2.25rem
  control-lg: 2.75rem
  app-bar-height: 3rem
  sidebar: 15rem
  icon-sm: 1rem
  icon-md: 1.25rem
  icon-lg: 1.5rem
  table-header: 2.25rem
  table-row-compact: 2.25rem
  table-row: 2.75rem
  table-row-comfortable: 3rem
  dialog-sm: 30rem
  dialog-md: 40rem
  dialog-lg: 50rem
  form-max: 40rem
  settings-max: 50rem
  prose-max: 72ch
  breakpoint-sm: 640px
  breakpoint-md: 768px
  breakpoint-lg: 1024px
  breakpoint-xl: 1280px
components:
  app-bar:
    backgroundColor: "{colors.app-bar}"
    textColor: "{colors.app-bar-text}"
    height: "{spacing.app-bar-height}"
    padding: "{spacing.page-desktop}"
  sidebar:
    backgroundColor: "{colors.surface}"
    width: "{spacing.sidebar}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.sm}"
    height: "{spacing.control-md}"
    padding: 0.75rem
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.sm}"
    height: "{spacing.control-md}"
    padding: 0.75rem
  button-danger:
    backgroundColor: "{colors.error}"
    textColor: "{colors.on-error}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.sm}"
    height: "{spacing.control-md}"
    padding: 0.75rem
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    height: "{spacing.control-md}"
    padding: 0.75rem
  input-error:
    textColor: "{colors.error}"
  table-header:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body-strong}"
    height: "{spacing.table-header}"
    padding: 0.75rem
  table-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    height: "{spacing.table-row}"
    padding: 0.75rem
  dialog:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    width: "{spacing.dialog-md}"
    padding: "{spacing.page-desktop}"
---

# t128n Design

Version alpha · Updated 2026-11-02

## Overview

A minimal, technical, enterprise-influenced visual language for personal applications, developer tools, dashboards, and consumer-facing experiences. Optimize for clarity, utility, predictability, and low visual noise; the identity should be subtly recognizable rather than expressive. The result should feel like a precision instrument: calm, dense, and legible under pressure.

### How to Use This Document

> **Prefer defaults over rules.** This document defines a consistent starting point, not a complete specification of every interface. Reuse established components and platform conventions. Deviate when the application needs it; add shared rules only when repeated implementations demonstrate a genuine need.

This document owns cross-application visual decisions: tokens, component appearance, and visual acceptance criteria. [`INTERFACE.md`](INTERFACE.md) owns the task, content, hierarchy, and state model. The canonical CSS token source is [`tokens.css`](tokens.css); copy it into the application and import it before component styles. Applications implement their own components from it rather than building a parallel language. Reference implementations live in `examples/`, with copyable extracts in `PATTERNS.md`; they show the system applied to real screens, but this document remains authoritative for appearance.

When rules conflict, resolve in this order: accessibility and platform correctness → task comprehension and interface content → browser and OS convention → this document → application-local choices → component-library defaults. Deliberate deviations are fine; record them in the application's design notes.

**Rule Tiers.** MUST is reserved for accessibility, tokens/contrast/focus, and destructive honesty. SHOULD is the default; deviate with a one-line reason. MAY is context-dependent.

**Open.** Not decided here: logo and mark usage, illustration style, email and document templates, icon sets beyond Lucide, and application-local navigation labels. Task, content, hierarchy, state, and page-structure decisions belong to [`INTERFACE.md`](INTERFACE.md); this document governs their visual expression.

### Tokens and Units

Token values live in the front matter; the sections below govern their use. Every color has a light value and, where the dark theme differs, a `-dark` counterpart (e.g. `canvas-dark`). Components reference the base token; the `-dark` token takes over when the dark theme is active. Tokens without a `-dark` suffix are identical in both themes.

The canonical implementation is [`tokens.css`](tokens.css). It is the only file that should contain literal design values. Copy it into the target project as the single token source, import it before component styles, and consume the custom properties everywhere.

| Category | Prefix | Example |
| --- | --- | --- |
| Color | `--color-` | `--color-canvas` |
| Type | `--font-` | `--font-sans`, `--font-size-body` |
| Space | `--space-` | `--space-4` |
| Control and row size | `--size-` | `--size-control-md` |
| Layout | `--layout-` | `--layout-sidebar` |
| Radius | `--radius-` | `--radius-md` |
| Shadow | `--shadow-` | `--shadow-overlay` |
| Motion | `--motion-` | `--motion-fast` |
| Layer | `--z-` | `--z-dialog` |

The prose below uses short role names (`canvas`, `text-primary`, `surface-2`) for readability. The CSS property is the namespaced form: `--color-canvas`, `--color-text-primary`, `--color-surface-2`.

Every type, spacing, control, and layout token is in rem so it follows the user's text-size setting; only 1px hairlines, 2px focus rings and indicators, shadow geometry, and breakpoints stay in px. Prose values are the source values — at the default 16px root, 0.25rem is 4px, 0.875rem is 14px, 2.25rem is 36px, and 15rem is 240px. Implement through tokens; never hardcode a color or sizing literal in component CSS. If a one-off dimension is needed, add a named token to `tokens.css` and consume it. Do not duplicate the token block in component styles.

### Principles

Where principles conflict, legibility and safety outrank density and speed.

1. **Every pixel carries operational information.** If removing it doesn't cost comprehension or speed, remove it. Static facts are documentation, not interface; see [`INTERFACE.md`](INTERFACE.md).
2. **Density is a feature; legibility is the floor.** A returning power user should finish the primary task without scrolling or drilling in — but density never wins a contrast, target-size, or focus test.
3. **One accent, earned.** More than one accent-colored element in a region needs a reason.
4. **Structure comes from alignment and rules, not depth.** Disable every shadow; hierarchy must survive.
5. **Predictability over novelty.** A user should be able to guess where a control lives and what it is called.

### Signature Moves

The recognizable t128n traits. Use these consistently; they are the identity.

- A **3rem app bar** above the canvas, a **15rem sidebar** on `surface`, and a 1px `app-bar-divider` between the bar and the page.
- **1px `border-subtle`** doing the structural work instead of shadows.
- **Oxocarbon blue** as the only accent: `primary` in content and `accent-on-dark` on the app bar. The wordmark uses the same accent — there is no separate brand color.
- **0.875rem Geist Sans** at 400 and 600 (1rem on content screens). **Geist Mono** only for code, technical identifiers, and aligned numerals.
- **Subtly striped tables** on `surface`, never enclosed in a container.
- **2.25rem default controls** with 1.5rem page padding, and 2.25rem compact rows.

## Colors

The palette is derived from **Oxocarbon** (base16) — [base16-oxocarbon](https://github.com/nyoom-engineering/base16-oxocarbon). Components consume namespaced role tokens — never raw hex, and never `base00`–`base0F`: Oxocarbon Light inverts its ramp, so base16 slot numbers do not map to UI roles across themes.

Oxocarbon contains **no red**; `base08` is cyan in dark and pink in light. Error, warning, and success come from outside the scheme, chosen for contrast. Do not "correct" them back toward slot names.

**Roles:**

| Role | Use |
| --- | --- |
| `canvas` | Page background; the base layer |
| `surface` | Sidebar, stripes, blocked regions; the first tint |
| `surface-2` | Table headers, hover, active, and disabled states; the state layer |
| `surface-3` | Selected vertical-navigation rows; the quiet selected layer between `surface` and `surface-2` |
| `border-subtle` | Structural separation |
| `border-strong` | Interactive boundaries: inputs, controls, buttons |
| `text-primary` | Body, headings |
| `text-secondary` | Supporting copy, labels, and metadata on any layer |
| `text-muted` | Placeholders and helper text on `canvas` and `surface` only |
| `text-disabled` | Disabled labels only |
| `primary` | Wordmark, actions, selection, and the focus ring |
| `primary-hover` | Hover and pressed state for primary actions |
| `accent-on-dark` | Wordmark and focus ring on the dark app bar |
| `app-bar`, `app-bar-raised`, `app-bar-text`, `app-bar-text-secondary`, `app-bar-divider` | The dark chrome and its states |
| `on-primary`, `on-error` | Text on solid `primary` and `error` fills |
| `error`, `error-hover` | Error text, error borders, and the danger button |
| `warning` | Warning text and icons |
| `success` | Success text and icons |
| `selection` | Text-selection overlay |
| `overlay` | Modal backdrop |

`selection` and `overlay` are alpha compositing values, not hex color tokens; their light and dark values are listed below.

**Contrast (MUST).** Body text ≥ 4.5:1, large text ≥ 3:1, interactive boundaries and focus rings ≥ 3:1 — measured on the layer the element actually sits on. Verified against canvas: `text-primary` 18.1/16.4, `text-secondary` 7.8/10.6, `text-muted` 5.0/5.5, `primary` 5.0/7.7. On the app bar, `app-bar-text` clears 16.4/13.7, `app-bar-text-secondary` 10.6/8.9, and `accent-on-dark` 6.4.

**State Layer.** `surface-2` is a fill-only state layer for table headers, hover, active, and disabled states: `text-primary` and `text-secondary` only — no `text-muted`, status text, borders, or controls. Metadata inside a hovered or active row uses `text-secondary`, and `primary` as text on `surface-2` is 3.8:1, below threshold. The ramp shortens on tints instead of gaining variations.

**Selected Layer.** `surface-3` is the fill-only selected layer for vertical navigation: a quiet step between `surface` and the `surface-2` state layer, so selection stays quieter than hover and never jumps to the page `canvas`. Use `text-primary` and `text-secondary` on it; `primary` as text measures 4.18:1 in light, below the body threshold.

**Accent on Dark Chrome.** The app bar is dark in both themes, so the accent resolves to `accent-on-dark` there — wordmark and focus ring, never `primary`.

**Accent Budget.** One primary action per screen; a dialog or independent section is its own scope. Accent marks the wordmark, the primary action, selection, focus, and current state — not headings, surfaces, or decorative borders.

**Selection.** Text selection uses the selection overlay — `rgba(15, 98, 254, 0.12)` in light, `rgba(51, 177, 255, 0.16)` in dark — and keeps `text-primary`. Persistent selection uses the 2px `primary` indicator described under Interactive States. Vertical navigation rows also take the `surface-3` selected fill, so the indicator, label, and row read as one object; horizontal navigation and other selected rows stay unfilled. Never invert text or fill a row with solid primary.

**Overlay.** The modal backdrop is `rgba(22, 22, 22, 0.5)` in light and `rgba(0, 0, 0, 0.6)` in dark.

**Status.** Always icon and text, never color alone. Status colors are text and icons; the only solid status fill is the danger button, `error` with `on-error`.

**Charts.** Use the ordered tokens `chart-1` through `chart-6` — light `#0F62FE`, `#0E6027`, `#EE5396`, `#673AB7`, `#37474F`, `#8A5A00`; dark `#33B1FF`, `#42BE65`, `#FF7EB6`, `#BE95FF`, `#82CFFF`, `#F1C21B` — maximum 6 series, each labelled. Chart colors are positional, not semantic: never borrow a status color to mean status. Area fills ≤ 20% opacity.

**Theme.** Follow the OS preference with a manual override persisted per user, and ship both themes complete — never a light-only or dark-only screen. The override survives reloads and, where there are accounts, follows the user; clearing it returns to the OS preference. Set `color-scheme` on the root element to match the active theme so scrollbars, form controls, and native pickers follow, keep `<meta name="theme-color">` in step with `canvas` (the one place a canvas hex may appear outside `tokens.css`), and resolve the theme before first paint — no flash of the wrong theme.

## Typography

- **Fonts:** Geist Sans (`'Geist Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`) for UI and prose; Geist Mono (`Geist Mono, ui-monospace, SFMono-Regular, monospace`) only for code, technical identifiers, and aligned numerics. Monospace is functional, never stylistic: no mono for labels, headings, or decoration. Weights: **400 and 600** only; no italics in UI chrome. Set `font-optical-sizing: auto` and let the variable face adjust itself.
- **Scale:** 0.75 caption · 0.875 body · 1 `body-content` · 1.25 section heading · 1.5 page heading · 2 page title · 0.8125 mono (rem; 12/14/16/20/24/32/13 at the default root). **MUST NOT** add interface sizes between these or go below 0.75rem.
- **Per shell:** app and focused app screens run body at **0.875rem** with a 1.5rem page heading. Content screens run `body-content` at **1rem** with a 2rem page title and 1.25rem section headings. Navigation, tables, controls, and captions stay at 0.875/0.75; monospace at 0.8125.
- **Line height:** 1.2 for the 2rem title, 1.25–1.3 for 1.25–1.5rem headings, 1.5 for UI, 1.6 for prose.
- **Tracking:** 0 by default; `-0.01em` at 1.5rem and `-0.02em` at 2rem. Tracking is size-specific — never one fixed value across the scale.
- **Case:** Title Case (Chicago) for page and dialog titles, section headings, buttons, navigation items, menu items, table headers, tabs, field labels, and empty-state titles. Capitalize the first and last word and every word except articles (*a, an, the*), coordinating conjunctions (*and, but, or, nor, for, so, yet*), and short prepositions (*at, by, in, of, on, to, per, via*) unless first or last. Prose, descriptions, helper text, errors, and status messages stay sentence case. Preserve brand and identifier casing (iPhone, macOS, GitHub). No all-caps.
- **Text size:** users change type size, not just zoom. Keep type, spacing, and control heights in rem, size boxes with `min-height` and padding rather than a fixed height around text, and confirm the layout still reads at 200% text size without clipping or overlap.
- **Hierarchy:** establish with size, weight, and spacing — not color, underlines, or rules. No more than 3 content sizes and 2 weights in one screen; chrome sizes (0.875/0.75/0.8125) are exempt.
- **Prose:** 60–80 characters per line (`prose-max: 72ch`). Dashboards, tables, code, and tools use available width. Headings use `text-wrap: balance`, body copy `text-wrap: pretty`.
- **Numerals:** tabular figures (`font-variant-numeric: tabular-nums`) in tables, metrics, and any vertically aligned figures.
- **Label–value rows:** label left at body size, value right-aligned on the same baseline, one pair per line, tabular figures. Identifiers take mono 0.8125 (0.75 in table cells); dates, counts, and figures stay in sans. Rows take their height from the density scale, sit on 1px `border-subtle` rules with a top rule under the heading, and carry no container.
- **Truncation:** end-truncate prose, middle-truncate identifiers (`abcdef…xyz`); full value on hover and focus. **MUST NOT** truncate the only copy of a value.

## Layout

### Spacing and Density

- **MUST** use the 4px (0.25rem) scale for layout spacing: `0.25 0.5 0.75 1 1.5 2 3 4rem` — 4/8/12/16/24/32/48/64 at the default root. Icon sizes, radii, border widths, and control heights are separate tokens, not spacing.
- Page padding: **1.5rem** desktop, **1rem** below 768px.
- **Rhythm:** groups 0.25–0.5rem inside a field or row; blocks 0.75–1.5rem apart; page regions 1.5–2rem; form and content sections 3rem. A section gap is always larger than the gap inside it.
- **Alignment:** one edge per region. Left-align content, labels, and headings; right-align numeric table columns and trailing actions.
- **Density:**

| Mode | Control Height | Row Height | Typical Use |
| --- | --- | --- | --- |
| Compact | 1.75rem | 2.25rem | Monitoring, triage, power tools |
| Default | 2.25rem | 2.75rem | Most application UI |
| Comfortable | 2.75rem | 3rem | Touch-first and low-frequency forms |

Density is declared once per product, not per screen. App and focused app shells default to **Default**; a monitoring or triage tool may declare **Compact**; a touch-first flow may declare **Comfortable**. The declaration applies to controls, navigation rows, list rows, and table rows alike. Below 768px, controls and rows have a 2.75rem minimum; a comfortable 3rem row stays 3. Heights are in rem, so they grow with the user's text size rather than clipping the label.

### Shells

- **App shell** (tools, dashboards): 3rem app bar, 15rem sidebar, 1.5rem content padding. App bar uses `app-bar` with a 1px `app-bar-divider` bottom edge; sidebar is `surface`; content is fluid. The sidebar begins below the app bar.
- **Content shell** (marketing, docs, reading): no sidebar, optional compact header, prose constrained to `prose-max`, 3–4rem between sections. Its mobile navigation is a panel below the header, not a drawer.
- **Focused shell** (auth, onboarding, single-task): no navigation chrome, a centered column no wider than 40rem, one primary action.
- **Focused app shell** (launchers, search-first tools): a 3rem app bar carrying identity, context, and account only — no navigation — and a centered column no wider than 40rem. The column is a single task, left-aligned inside.

The shell is chosen per screen, not per product: a marketing page and the app it advertises may share tokens and share no layout.

**Page Header.** Title 1.5rem/600 (2rem on content screens), optional description 0.875rem `text-secondary` capped at 72ch, primary action aligned right on the same baseline — the one deliberate exception to the single alignment edge — and a 1.5rem gap to content. When the page is a single form, the primary action belongs to the end of that form instead.

### Responsive

Adopt the framework breakpoints — 640/768/1024/1280px, mapped to `breakpoint-sm` through `breakpoint-xl` — which stay in px so they track devices rather than type size. Below 1024px the app-shell sidebar becomes a modal drawer below the app bar: focus is trapped and returns to the toggle; Escape, backdrop click, or the toggle closes it. Below 768px padding drops to 1rem and controls and rows have a 2.75rem minimum. Tables scroll horizontally by default; another responsive presentation is acceptable when cross-column comparison isn't the reading task. Verify no horizontal page scroll at 320px and no clipping at 200% text size.

### State and URLs

- The URL reflects the visible state: filters, sorting, search, pagination, tabs, and expanded panels live in query parameters, so a copied link reproduces the screen.
- Navigation uses real links so middle-click, Cmd/Ctrl-click, and open-in-new-tab work; anything that changes state without navigating is a button.
- A screen with state worth sharing recovers it on reload. Filters reset to an explicit default, never to a silently different view.

## Elevation & Depth

- Default to no elevation. Separate with whitespace, `surface`, and `border-subtle`.
- Shadows are theme-scoped — same geometry, stronger in dark. Menus and popovers use `raised` (`0 1px 2px rgb(0 0 0 / 0.10)` light, `0 1px 2px rgb(0 0 0 / 0.48)` dark); dialogs and the mobile drawer use `overlay` (`0 8px 24px rgb(0 0 0 / 0.18)` light, `0 8px 24px rgb(0 0 0 / 0.56)` dark) with a backdrop.
- Overlays animate at 240ms and use the fixed z-order: sticky 10, dropdown 20, backdrop 30, dialog 40, toast 60. Do not invent intermediate values.
- Every overlay establishes its own stacking context, so a menu inside a dialog sits above that dialog. A dialog and a drawer never stack.
- Containers are for things that float, scroll, or are discrete objects: menus, dialogs, drawers, code blocks, callouts. Tables, lists, grouped stats, and form sections get whitespace and rules, not containers.
- **MUST NOT** put shadows on cards, inputs, table rows, or buttons, or build an elevation scale beyond these two.

## Shapes

- Radius (`rounded`) follows the element class, not the component: **0.125rem** (`sm`) for controls, inputs, tags, checkboxes, and code; **0.25rem** (`md`) for containers — cards, menus, popovers; **0.375rem** (`lg`) for dialogs and drawers; **999px** (`full`) only for avatars and status dots.
- Nested controls stay concentric: `outer − inset`, minimum 0.125rem. Mixed radii inside one component are expected once a control sits in a container.
- Borders are 1px; 2px is reserved for focus rings and selection indicators.
- No pill-shaped buttons, no fully rounded cards, and outlined fields only.

## Components

Components come from the application's existing library. These rules constrain configuration, not implementation.

### Interactive States

Define the states that apply to each control — loading and error only where they can occur. Color alone never carries a state.

| State | Treatment |
| --- | --- |
| Default | role tokens only |
| Hover | one layer down: `canvas` steps to `surface`, `surface` to `surface-2`. Striped table rows always hover to `surface-2`. |
| Active | `surface-2`; primary and danger buttons use their variant hover color |
| Focus | 2px `primary` ring, 2px offset; `accent-on-dark` on the app bar |
| Selected / current | Horizontal navigation uses `text-primary` at 600 and a 2px `primary` underline that spans the full item and sits flush with the header rule, with no fill. Vertical navigation adds the `surface-3` selected fill to the same weight and a full-row-height leading bar. Other selected rows keep no fill and 400 weight. Hover and press do not change a selected item. A hovered row shows no bar, so fill alone never means selected. |
| Disabled | `surface-2` fill plus `text-disabled`; may fall below 4.5:1 but must still read as disabled by fill and label together. Prefer a persistent reason beside the control. |
| Loading | Interaction disabled, the label replaced by a progress indicator, the accessible name preserved, and the width stable |
| Error (fields) | `error` border plus 0.75rem `error` text with a 1rem icon, tied to the field |

Hover and active transitions run at 120ms; focus is instant. No component invents its own state colors.

Hover exists only where hover does: gate hover styling behind `@media (hover: hover) and (pointer: fine)`. On touch, a tap that only hovers leaves a stuck state — the press and selected states carry the feedback instead.

Press is confirmed immediately: a control shows its active fill on pointer-down and releases on pointer-up, and icon and ghost buttons may also take `scale(0.97)` at 120ms. Pointer targets carry about 0.5rem of invisible hit padding beyond the visible box.

### Touch and Pointer

- Set `touch-action: manipulation` on controls so taps are not delayed by double-tap zoom.
- Set `overscroll-behavior: contain` on dialogs, drawers, and scrolling overlays so scroll never chains to the page behind them.
- Set `-webkit-tap-highlight-color` intentionally — transparent where the press state is designed, since the system highlight lands in the wrong place.
- While a drag runs, disable text selection on the dragged content and keep the rest of the page from moving.
- Drag, swipe, and pinch gestures always have a click and a keyboard equivalent. No action is gesture-only.

### Control Sizing

Height, horizontal padding, and icon size are bound. Buttons, inputs, selects, and date fields use the triple below; textareas use the same horizontal padding and a minimum of 3 rows.

| Height | Horizontal Padding | Icon |
| --- | --- | --- |
| 1.75rem | 0.5rem | 1rem |
| 2.25rem | 0.75rem | 1.25rem |
| 2.75rem | 1rem | 1.25rem |

Navigation and menu rows follow the density's control height with 0.5rem horizontal padding and a 1rem icon: their labels lead, the icon supports. Below 768px the touch override raises heights to 2.75rem without changing horizontal padding.

### Buttons

| Variant | Background | Text | Border | Use |
| --- | --- | --- | --- | --- |
| Primary | `primary` | `on-primary` | none | The main action |
| Secondary | `canvas` | `text-primary` | 1px `border-strong` | Alternate, cancel, non-destructive |
| Ghost | transparent | `text-primary` | none | Toolbars, repeated row actions |
| Danger | `error` | `on-error` | none | Destructive action |
| Icon | transparent or secondary | currentColor | contextual | Space-constrained actions |

- Sizes follow control sizing; 0.5rem gap between icon and label; radius 0.125rem; 0.875rem/600 label.
- One primary button per screen or independent section; never two in one dialog.
- Disabled buttons use the disabled state. If the reason is not obvious, prefer an enabled button that explains on click, or persistent helper text.
- Destructive buttons label the action ("Delete Project"), never "Yes" or "OK".

### Inputs and Forms

- Height 2.25rem (1.75/2.75 by density); radius 0.125rem; 1px `border-strong`; background `canvas`; horizontal padding from control sizing.
- **Persistent labels above the field**, 0.875rem/400 `text-primary`, 0.25rem gap. Placeholders are examples only and never replace a label; they show a realistic pattern and end with an ellipsis where the input continues the thought.
- Helper text 0.75rem `text-muted`, 0.25rem below the field. Error text 0.75rem `error` with a 1rem icon.
- Focus is the standard 2px ring; the border does not change color alone.
- Single column. Two columns are allowed only for short, independent pairs (city/postal code, start/end date), and collapse below 768px.
- Required fields are marked; optional fields are marked "Optional" when most fields are required. Do not mark both.
- Selects, textareas, and date fields share these metrics. Textareas are at least 3 rows and resize vertically. Form width caps at 40rem.
- Inputs take a meaningful `name` and `autocomplete`, the correct `type` and `inputmode`, disable spellcheck on emails, codes, and usernames, and never block paste. Labels are clickable. The submit control stays enabled until the request starts, then shows progress, and warns before navigating away from unsaved changes.

### Navigation

- Sidebar width 15rem; items at the density's control height, 0.5rem horizontal padding, radius 0.125rem, 1rem icon, 0.875rem/400 label.
- Selected state: horizontal navigation uses `text-primary` at 600 and a 2px `primary` underline that spans the full item and sits flush with the app-bar rule, with no fill. Vertical navigation adds the `surface-3` selected fill to the same weight and a 2px leading bar that runs the full row height at the leading edge. The indicator and weight carry the state together — never color alone.
- Hover uses `surface-2`; focus uses the standard ring. Selected items take no hover or press fill. Nav labels carry no text underline; the selected indicator is the only rule.
- Secondary navigation sits inline under a 1px `border-subtle` divider; do not pin it to the bottom of the sidebar.
- App bar: 3rem, `app-bar` background with a 1px `app-bar-divider` bottom edge, `app-bar-text` labels, `app-bar-text-secondary` for secondary context, 1.25rem icons, 0.875rem/400 labels. Slots: menu (mobile only), wordmark, divider, workspace, spacer, theme toggle. It may be omitted on content, auth, and focused screens.
- **MUST** keep a skip link to main content in every app shell.
- Mobile navigation is contextual, but must be reachable in one tap and must not hide the current location.

### Tables

- Header 2.25rem, `surface-2`, 0.875rem/600; text left-aligned, numerics right-aligned with tabular figures.
- Rows 2.25/2.75/3rem by density, striped `surface` against `canvas`, 0.5rem × 0.75rem cell padding, 1px `border-subtle` below the header only. A table is page structure, not an object: no surrounding border, radius, or card.
- Hover uses `surface-2` on every row. Selected table rows take no fill; they use the 2px `primary` leading bar and keep 400 weight so columns do not shift.
- Sorting is shown by an icon on the header control plus a change in its label, never color alone.
- Row actions appear on hover and focus, and are always available in a menu for keyboard and touch users.
- Search and filters sit in the table or list toolbar as visible controls; avoid hidden filter menus for primary filtering. Their state lives in the URL.
- Sticky headers are allowed for long tables; virtualize or paginate above about 50 rows. Empty results use the empty-state pattern, never a blank table body.

**Table or List?** Use a table when rows are scanned or compared across columns, or when sorting applies. Use a list when there is one primary column plus metadata and a trailing action, with no sorting axis. Lists use the same row heights (2.25/2.75/3rem) and a 1px `border-subtle` rule between rows; they never stripe.

### Dialogs and Overlays

- Width 30/40/50rem by content; padding 1.5rem; radius 0.375rem; `overlay` shadow; backdrop `overlay` color. Max height 80vh with internal scrolling and `overscroll-behavior: contain`.
- Title 1.25rem/600; actions bottom-right, secondary before primary.
- **MUST** be a real modal: focus trapped, labelled by its title, dismissed by Escape, and focus returned to the trigger. Do not imitate one with a positioned div.
- **MUST NOT** stack dialogs. If a flow needs two, it is a page.
- Prefer inline panels and drawers over dialogs for edit flows; reserve dialogs for confirmations, short forms, and blocking decisions.

### Feedback

- Inline is the default: field errors under the field, outcomes beside the action or section heading until the next change, background results in the region they affect, copy confirmations beside the trigger. Floating notifications are acceptable only for global background events that have no persistent region; they sit at the toast layer, above every dialog, and never become the only record of an outcome.
- Success, warning, and error are always icon and text; neutral confirmations may be text only. Failures persist until the next change; confirmations may clear.
- No indicator under 300ms. Above that, show progress in the region that is waiting; reserve skeletons for layouts already known and never block the whole screen for a partial refresh. Progress is determinate when measurable, and loading labels end with an ellipsis ("Loading…").
- Async results are announced in a polite live region without moving focus.

### Destructive Actions

- Confirm when the action is irreversible or high-impact, in a dialog that names the object and the consequence and repeats the verb in the button ("Delete 3 Files", not "Continue"). Low-impact, easily reversible removals may proceed without a dialog.
- Undo is allowed where the application supports it reliably; the dialog must be honest about what is removed and whether it can be recreated.
- Destructive actions live on the object's own screen — the row menu, the detail page, the danger zone — never inside an edit form or an edit drawer.
- **MUST NOT** ask for confirmation on non-destructive actions — "Save", "Archive", and "Copy" never open a dialog. Actions sit bottom-right, secondary before the destructive action, and the destructive button uses danger, never primary.

### Patterns

**Empty States.** Two kinds, both in the document flow and neither a dead end. "Nothing Yet" states the fact and offers one action — primary unless the screen already owns one, then secondary. "No Results" states the fact and offers a secondary "Clear Filters" as the only action.

**Settings.** Single column, capped at 50rem, grouped by task with 1.25rem section headings. Destructive settings are isolated in a final, clearly labelled section. When the page is one form, the save action sits at the end of the form and the page header carries no primary action.

**Auth and Onboarding.** Focused shell, no navigation, 25–40rem column; labels above fields, one primary action, inline errors, password-manager-friendly. Social or alternate methods sit below the primary form, separated by a rule.

### Media

- Images take explicit `width` and `height` so space is reserved before they load, plus descriptive `alt`; decorative media uses `alt=""` and `aria-hidden="true"`.
- Below-fold images load lazily; the largest above-fold image loads eagerly at high priority.
- Use compressed `<video autoplay muted loop playsinline>` rather than an animated GIF, with a still fallback, and no autoplay under `prefers-reduced-motion`.
- Meaningful audio and video carry captions and a transcript; media controls are keyboard operable and reachable in DOM order.

### Component Inventory

Illustrative, not exhaustive. Anything else is application-local: keep it consistent with these rules and add it here when it ships.

- **Shell:** app bar, sidebar navigation, skip link, page header.
- **Data:** table, list.
- **Input:** button, icon button, text field, select, textarea, date field, checkbox, radio.
- **Overlay:** menu, drawer, dialog, toast.
- **Content:** code block, callout, inline status, media.

## Do's and Don'ts

- Do use namespaced color and sizing tokens — never raw hex or literals — and ship both themes complete.
- Do keep one primary action per screen or independent section, and reserve the accent for the wordmark, that action, selection, focus, and current state.
- Do build structure from alignment, 1px `border-subtle` rules, and `surface` tints before reaching for a shadow.
- Do keep body text at 4.5:1 and interactive boundaries and focus rings at 3:1 on the layer each element actually sits on.
- Do make focus visible and instant: 2px ring, 2px offset, never animated.
- Do make every flow complete with the keyboard alone — visible focus, no gesture-only action, and the applicable states defined.
- Do give every field a persistent label, an accessible name, and inline, announced errors.
- Do name destructive actions after their consequence and confirm only irreversible or high-impact ones.
- Do keep copy in Title Case for names and sentence case for sentences, with verb-first buttons.
- Do design empty, loading, and error states, and reflow at 320px, 400% zoom, and 200% text size.
- Do build from rem tokens; only 1px hairlines, shadow geometry, and breakpoints use px.
- Do honor `prefers-reduced-motion`, `prefers-contrast`, and `forced-colors`.
- Don't add type sizes between the scale or go below 0.75rem.
- Don't use mono for labels, headings, or decoration.
- Don't put shadows on cards, inputs, table rows, or buttons.
- Don't use color alone for status, selection, or sorting.
- Don't fill a row with solid primary, invert text, or stack dialogs.
- Don't ask for confirmation on non-destructive actions.
- Don't use emoji, flags, or bespoke SVG sets as UI chrome.
- Don't animate anything used many times a day; keyboard and focus states change instantly.

## Iconography

- **Lucide outlined icons only**: 1rem inline, 1.25rem in controls, 1.5rem for standalone actions. Library-default stroke width; never mix filled and outlined styles.
- Icons supplement labels. Icon-only controls need an accessible name and reveal it on hover and focus.
- **MUST NOT** use emoji, flags, or bespoke SVG sets as UI chrome.

## Motion

- 120ms for hover and press; 180ms for expand and view changes; 240ms for overlays. Exits run at roughly 70% of the enter duration — the same path, faster.
- **Frequency Test.** Motion is rationed by how often it is seen. Anything used tens or hundreds of times a day — command palettes, tab-through focus, row and list navigation, toggles fired from a shortcut — changes state instantly, with no transition and no delay. Reserve animation for occasional surfaces: overlays, expand and collapse, view changes.
- **No Animation on Keyboard Actions.** Focus rings, selection, and every state a keypress changes appear instantly. A 120ms transition on the focus ring makes fast keyboard use feel laggy; the ring is always visible and never animated.
- **Response.** Feedback begins on pointer-down or key-down, never on release, and a drag updates its target continuously rather than at the end. No debounce, artificial wait, or transition delay sits on the input path.
- Easing: `cubic-bezier(0.2, 0, 0.38, 0.9)`. No bounce, spring overshoot, or parallax. A critically damped spring with **no** overshoot is acceptable where a gesture must be interruptible — the ban is on the bounce, not on the technique.
- Animate color, background, border, opacity, and transform; never layout. No decorative or looping animation, and do not mix snap states with animated ones.
- **Interruptible.** A transition may be reversed at any instant: always animate from the current on-screen value, never from the target, and never lock out input while a transition runs. A closing overlay grabbed mid-flight follows the pointer, it does not finish closing first.
- **Enter and Exit.** Enter from `opacity: 0` with `scale(0.95)` or a small offset — never from `scale(0)`, and never from nothing. Exit along the same path it arrived by.
- **Origin.** Menus, popovers, and tooltips scale from the element that opened them (`transform-origin` at the trigger). Dialogs and drawers stay centered.
- **MUST** honor `prefers-reduced-motion: reduce`: remove transforms and movement, keep short opacity and color cross-fades, and never reposition or slide content. No information exists only in motion.

## Quality Bar

### Accessibility

Acceptance criteria; a screen that fails one is not done.

- Text ≥ 4.5:1 (disabled labels exempt); large text ≥ 3:1; interactive boundaries and focus rings ≥ 3:1 — measured on the layer the element sits on.
- Focus is always visible: 2px ring, 2px offset, on keyboard focus. Never remove it without an equivalent.
- Full keyboard operation in DOM order: Tab and Shift-Tab, Enter or Space to activate, Escape to close, arrows inside menus and composite widgets. Focus is trapped only in modal overlays.
- Every control is reachable and operable without a pointer. Drag interactions have a keyboard equivalent.
- Pointer targets ≥ 1.5rem on desktop; touch targets ≥ 2.75rem. A compact 1.75rem control does not shrink the touch target.
- Every field has a visible label and an accessible name; every icon-only control carries a name and reveals its label on hover and focus.
- Errors are tied to their field and announced; the first invalid field receives focus on submit.
- No meaning is carried by color alone: status, selection, and sorting each have a second channel.
- Reflow at 320px and 400% zoom without two-dimensional page scrolling, and no clipping or overlap at 200% text size.
- `prefers-reduced-motion` is honored; no information exists only in motion.
- `prefers-contrast: more` raises every separator to `border-strong` and makes surfaces near-solid; under `forced-colors: active`, structure survives on system colors alone — never rely on a background image or `box-shadow` to carry meaning.
- Every app shell has a skip link, one main landmark, one `h1` per screen, and no skipped heading levels.
- Focus moves only in response to the user's action — never on a timer, a background update, or a filter change, and never animated.

### Performance

- Virtualize or paginate tables and lists above about 50 rows; a sticky header is not a license to ship thousands of DOM rows.
- Reserve space for images, media, and async content so nothing shifts as it loads.
- Never read layout during render (`getBoundingClientRect`, `offsetHeight`, `scrollTop`); batch reads and writes.
- Preload critical fonts with `font-display: swap` and preconnect to asset and API origins.
- Keep motion on `transform` and `opacity`, so animation stays off the layout and paint path.

### Content

[`INTERFACE.md`](INTERFACE.md) decides whether a string should exist; this section decides how it is written and set. If a sentence does not change a decision, remove it.

- **Title Case for names, sentence case for sentences.** Headings, dialog titles, buttons, navigation, menu items, table headers, tabs, field labels, and empty-state titles use Chicago Title Case — small words lowercase unless first or last. Prose, descriptions, helper text, errors, and status messages stay sentence case. No all-caps labels.
- **Buttons:** verb-first, 1–3 words — "Save Changes", "Create Project", "Delete File". Not "OK", "Submit", or "Yes" where a verb fits.
- **Errors:** what happened, why, and what to do next. Two sentences maximum, no blame, no raw codes. "Couldn't save the project. The server returned an error — try again."
- **Voice:** second person, plain, specific. No exclamation marks, no jokes in error paths, no emoji in UI chrome.
- **Punctuation:** the ellipsis is `…`, never `...`; quotes are curly `“ ”`; units and shortcuts take a non-breaking space (`10 MB`, `⌘ K`); loading labels end with an ellipsis ("Saving…").
- **Dates and identifiers:** ISO `2026-11-01` in tools and logs, localized in prose; dates in sans with tabular figures, never mono. Slugs, email addresses, IDs, and code use mono 0.8125 (0.75 in table cells). Format dates, numbers, and currency with `Intl.DateTimeFormat` and `Intl.NumberFormat`, never a hand-rolled pattern. Wrap brand names, code tokens, and identifiers in `translate="no"`.
- **Numbers and links:** thousands separators, units always labelled, real plurals. Describe link destinations ("Billing Settings"); prose links use `primary` with a 1px underline and 2px offset.
