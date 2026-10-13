---
version: alpha
name: Funnel System
description: High-density, high-speed GitHub triage interface combining Linear's fluidity, Windows 11's layered acrylic depth, Oxocarbon's modernist palette, and developer-tool typography.
schemes:
  dark:
    scheme: "Oxocarbon Dark"
    author: "shaunsingh/IBM"
    base00: "#161616"
    base01: "#262626"
    base02: "#393939"
    base03: "#525252"
    base04: "#dde1e6"
    base05: "#f2f4f8"
    base06: "#ffffff"
    base07: "#08bdba"
    base08: "#3ddbd9"
    base09: "#78a9ff"
    base0A: "#ee5396"
    base0B: "#33b1ff"
    base0C: "#ff7eb6"
    base0D: "#42be65"
    base0E: "#be95ff"
    base0F: "#82cfff"
  light:
    scheme: "Oxocarbon Light"
    author: "shaunsingh/IBM"
    base00: "#f2f4f8"
    base01: "#dde1e6"
    base02: "#525252"
    base03: "#161616"
    base04: "#262626"
    base05: "#393939"
    base06: "#525252"
    base07: "#08bdba"
    base08: "#ff7eb6"
    base09: "#ee5396"
    base0A: "#FF6F00"
    base0B: "#0f62fe"
    base0C: "#673AB7"
    base0D: "#42be65"
    base0E: "#be95ff"
    base0F: "#37474F"
colors:
  surface-base: "var(--color-surface-base, #161616)"
  surface-layer-1: "var(--color-surface-layer-1, #262626)"
  surface-layer-2: "var(--color-surface-layer-2, #393939)"
  surface-overlay: "var(--color-surface-overlay, #525252)"
  border-subtle: "var(--color-border-subtle, #393939)"
  border-focus: "var(--color-border-focus, #3ddbd9)"
  text-primary: "var(--color-text-primary, #f2f4f8)"
  text-secondary: "var(--color-text-secondary, #dde1e6)"
  text-muted: "var(--color-text-muted, #525252)"
  primary: "var(--color-primary, #33b1ff)"
  primary-hover: "var(--color-primary-hover, #82cfff)"
  accent-cyan: "var(--color-accent-cyan, #08bdba)"
  accent-turquoise: "var(--color-accent-turquoise, #3ddbd9)"
  accent-blue: "var(--color-accent-blue, #78a9ff)"
  accent-magenta: "var(--color-accent-magenta, #ee5396)"
  accent-pink: "var(--color-accent-pink, #ff7eb6)"
  accent-green: "var(--color-accent-green, #42be65)"
  accent-purple: "var(--color-accent-purple, #be95ff)"
typography:
  headline-lg:
    fontFamily: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: -0.005em
  body-sm:
    fontFamily: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
  label-code:
    fontFamily: "JetBrains Mono", "Fira Code", monospace
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0.02em
rounded:
  none: 0px
  xs: 3px
  sm: 6px
  md: 8px
  lg: 12px
  full: 9999px
spacing:
  base: 16px
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
components:
  issue-row:
    backgroundColor: "{colors.surface-layer-1}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: 8px
  issue-row-hover:
    backgroundColor: "{colors.surface-layer-2}"
    textColor: "{colors.text-primary}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: 6px
  badge-filter:
    backgroundColor: "{colors.surface-layer-2}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.xs}"
    padding: 4px
---

## Overview

Funnel is an ultra-fast, mouse-first triage cockpit for GitHub issues across multiple repositories and organizations.

The visual design language blends:

- **Linear:** Compact information density, subdued dark palettes, sub-pixel precision, and instant visual feedback on cursor interaction.
- **Windows 11:** Deliberate layering, translucent mica/acrylic backdrops on modals and flyouts, and uniform `6px` radius contours.
- **Oxocarbon (IBM Carbon):** High-contrast modernist color palette created by Shaun Singh based on IBM Carbon. Grounded in industrial charcoals and clean whites, accented with high-chroma cybernetic neons (cyan, turquoise, soft blue, magenta, pink, lavender).
- **OpenCode:** High-legibility developer-first monospace metadata tags, high-contrast syntax cues, and zero visual clutter.

Every element is tuned for spatial economy, zero interaction latency, and rapid visual scanning.

## Colors

Funnel supports system-driven theme switching (Dark and Light) powered by CSS design tokens mapped to the **Oxocarbon** palette.

### Base16 Schemes

#### Oxocarbon Dark
```yaml
scheme: "Oxocarbon Dark"
author: "shaunsingh/IBM"
base00: "161616" # Surface Base (deep canvas)
base01: "262626" # Surface Layer 1 (cards, side nav, panels)
base02: "393939" # Surface Layer 2 (hover state, active selections, subtle border)
base03: "525252" # Surface Overlay (flyouts, menus, muted borders)
base04: "dde1e6" # Text Secondary (metadata, repo badges)
base05: "f2f4f8" # Text Primary (issue titles, headlines)
base06: "ffffff" # Text Highlight (high-contrast values)
base07: "08bdba" # Accent Cyan
base08: "3ddbd9" # Accent Turquoise (focus rings)
base09: "78a9ff" # Accent Soft Blue (secondary highlights)
base0A: "ee5396" # Accent Magenta (critical / red semantics)
base0B: "33b1ff" # Primary Blue (execution buttons, active indicators)
base0C: "ff7eb6" # Accent Light Pink
base0D: "42be65" # Accent Green (open state)
base0E: "be95ff" # Accent Lavender / Purple (closed / done state)
base0F: "82cfff" # Primary Hover (sky blue)
```

#### Oxocarbon Light
```yaml
scheme: "Oxocarbon Light"
author: "shaunsingh/IBM"
base00: "f2f4f8" # Surface Base (light canvas background)
base01: "dde1e6" # Surface Layer 1 (cards, containers, sidebar)
base02: "525252" # Surface Layer 2 / borders
base03: "161616" # Text Primary (high contrast body/headers)
base04: "262626" # Text Secondary (high contrast metadata)
base05: "393939" # Text Secondary
base06: "525252" # Text Muted
base07: "08bdba" # Accent Cyan
base08: "ff7eb6" # Accent Light Pink
base09: "ee5396" # Accent Red / Critical
base0A: "FF6F00" # Accent Amber (blocked / warning)
base0B: "0f62fe" # Primary IBM Blue (execution buttons, active indicators)
base0C: "673AB7" # Primary Hover / Deep Purple
base0D: "42be65" # Accent Green (open state)
base0E: "be95ff" # Accent Lavender / Purple (closed / done state)
base0F: "37474F" # Slate Muted
```

### Semantic Token Mapping

| Token | Oxocarbon Dark | Oxocarbon Light | Role |
| :--- | :--- | :--- | :--- |
| `surface-base` | `base00` (`#161616`) | `base00` (`#F2F4F8`) | Canvas underpinning all panels and multi-repo columns |
| `surface-layer-1` | `base01` (`#262626`) | `base01` (`#DDE1E6`) | Primary elevation for issue cards, sidebar, content containers |
| `surface-layer-2` | `base02` (`#393939`) | `base00` (`#F2F4F8`) | Hover states, active selection, secondary surfaces |
| `surface-overlay` | `base03` (`#525252`) | `base01` (`#DDE1E6`) | Dropdowns, popovers, quick-filters |
| `border-subtle` | `base02` (`#393939`) | `base01` (`#DDE1E6`) | Hairline 1px structural borders |
| `border-focus` | `base08` (`#3DDBD9`) | `base0B` (`#0F62FE`) | Interactive element focus indicator |
| `text-primary` | `base05` (`#F2F4F8`) | `base03` (`#161616`) | Issue titles, modal headers, primary values |
| `text-secondary` | `base04` (`#DDE1E6`) | `base05` (`#393939`) | Repository badges, assignees, timestamps |
| `text-muted` | `base03` (`#525252`) | `base06` (`#525252`) | Subtle shortcuts, placeholders, inactive hints |
| `primary` | `base0B` (`#33B1FF`) | `base0B` (`#0F62FE`) | Execution buttons and primary action cues |
| `primary-hover` | `base0F` (`#82CFFF`) | `base0C` (`#673AB7`) | Hover state for primary action buttons |
| `accent-green` | `base0D` (`#42BE65`) | `base0D` (`#42BE65`) | Status: Open issues |
| `accent-purple` | `base0E` (`#BE95FF`) | `base0E` (`#BE95FF`) | Status: Closed / Done issues |
| `accent-amber` | `base09` (`#78A9FF`) | `base0A` (`#FF6F00`) | Status: Blocked issues |
| `accent-red` | `base0A` (`#EE5396`) | `base09` (`#EE5396`) | Status: Critical / Failed checks / Destructive actions |

## Typography

- **System Stack:** `Inter` combined with system fallbacks (`-apple-system`, `BlinkMacSystemFont`, `Segoe UI`) drives structural text at compact desktop scales (12px–16px).
- **Monospace Stack:** `JetBrains Mono` handles GitHub issue numbers (`#1042`), git SHAs, labels, and hotkey hints.
- **Scale:** Base body sits firmly at `13px` to balance readability with high item density per viewport fold.

## Layout

A modular multi-pane architecture built for widescreen displays and mouse drag-and-drop mechanics.

- **Root Canvas:** Three-pane structure consisting of a collapsible organization/repo sidebar (fixed 220px), a high-density triage list/kanban stream (flexible width), and an expandable issue inspector pane (fixed 480px).
- **Scale:** Strict 4px base increment (`xs: 4px`, `sm: 8px`, `md: 12px`, `lg: 16px`).
- **Gutter & Containment:** 8px gutters between dense issue cards; 12px internal containment for dialogs and panels.

## Elevation & Depth

Funnel eschews heavy drop shadows in favor of 1px structural borders and subtle ambient illumination:

- **Elevation 0 (Canvas):** Flat base surface (`surface-base`) with inset container borders (`border-subtle`).
- **Elevation 1 (Issue Rows / Cards):** Solid fill (`surface-layer-1`) bound by a 1px border. Hover transitions illuminate the background to `surface-layer-2` with zero layout shift.
- **Elevation 2 (Floating Popovers / Menus):** 12px backdrop blur (Mica/acrylic CSS effect) over semi-transparent surface tokens, bounded by a 1px border (`border-subtle`) and an ambient shadow: `0 8px 24px rgba(0, 0, 0, 0.45)`.

## Shapes

- **Corner Radii:** Consistent `6px` (`rounded.sm`) across buttons, inputs, context menus, and issue list rows.
- **Badges & Tokens:** `3px` (`rounded.xs`) for compact repo identifiers, issue numbers, and GitHub tags.
- **Edge Treatment:** Crisp 1px solid hairline borders with no bevels.

## Components

- **Issue Row:** Compact list item (36px fixed height). Left-aligned state icon, repo tag (`JetBrains Mono`, 11px), truncated title (`13px`), and right-aligned interactive hover actions (Assign, Close, Snooze).
- **Inspector Pane:** Docked side panel for inspecting comments and editing issue metadata without navigating away from the triage stream.
- **Filter Bar:** Low-profile toolbar containing segmented pill selectors, multi-select repository dropdowns, and instant filter chips.
- **Quick-Action Context Menu:** Mouse-driven popup on right-click or row hover, utilizing Acrylic backdrop-filter styling and 6px rounded edges.

## Do’s and Don’ts

- **Do** optimize for mouse precision: provide generous click targets on compact UI via invisible padding bounds.
- **Do** preserve 1:1 parity with GitHub's foundational entities (issues, labels, milestones) while decoupling visual presentation.
- **Do** use monospace typography for every identifier tied to GitHub (`#ID`, branch, commit, tag).
- **Don't** use slow layout transitions or spring animations; keep state changes under 100ms or instant.
- **Don't** use bright accent colors for decorative containers—reserve saturation strictly for status, labels, and destructive alerts.
- **Don't** allow long issue titles to wrap within dense list views; truncate with an ellipsis (`...`) and reveal details via inspector or hover tooltips.
