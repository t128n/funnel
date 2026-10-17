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
  surface-base: "var(--color-surface-base, #2a2a2a)"
  surface-layer-1: "var(--color-surface-layer-1, #161616)"
  surface-layer-2: "var(--color-surface-layer-2, #262626)"
  surface-overlay: "var(--color-surface-overlay, #2f2f2f)"
  island-header: "var(--color-island-header, #1e1e1e)"
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
  island: 10px
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

## Islands

The shell follows JetBrains' **Islands** layout language (IntelliJ Platform SDK, "Supporting Islands Theme"): every working area is an independent, rounded surface — an *island* — floating on a single shared *canvas*. Areas are separated by real elevation and a visible gap, never by drawn hairlines. This supersedes the older edge-to-edge, border-separated chrome.

### Role model

Every region maps to exactly one role, and every structural color key references that role:

| Region | Role |
| :--- | :--- |
| `.shell` background + gaps | **Canvas** — the "sea" between islands |
| Sidebar | **Island** (tool window) |
| Feed column (Inbox / Issues) | **Island** (tool window) |
| Detail canvas / Inspector / Submission detail | **Island** (editor) |
| Board columns | **Island** |
| `feed-head`, `inspector__head`, `sd__head`, `column__head`, side-head | **Island header band** — one step off the island |
| `composer`, `sd__triage` | **Island footer band** |
| `FilterBar`, `view__head`, nav | **Borderless chrome** — floats on the canvas |

### Geometry tokens (`tokens.css`)

JetBrains stores 2× the effective arc and gap + 1, so the raw values are not the pixels on screen:

| Token | Value | Effective | Meaning |
| :--- | :--- | :--- | :--- |
| `--island-arc` | 20px | 10px | Corner arc (2× scale) → `--island-radius` |
| `--island-border-width` | 5px | 4px | Gap between islands → `--island-gap` |
| `--island-radius` | — | 10px | `calc(--island-arc / 2)` |
| `--island-gap` | — | 4px | `calc(--island-border-width - 1px)` |
| `--island-header-height` | — | 40px | Shared height of every island header band (36px compact) |

Compact viewports (`≤1280px` wide or `≤800px` tall) shrink to arc 16 → 8px, borderWidth 4 → 3px, and header height 40 → 36px.

Every island header band — sidebar, feed, inspector, submission detail, board column, and the board's view/filter toolbars — is exactly `--island-header-height`. Where a band needs a second row (e.g. the feed's search), that row is a **secondary toolbar** on the island surface, not part of the band.

### The inversion rule

The canvas is deliberately never the darkest surface in dark mode:

- **Dark:** the canvas (`#2a2a2a`) is *lighter* than the islands (`#161616`) — the sea glows faintly around the land.
- **Light:** the canvas (`#d2d4d9`) is *darker* than the islands (`#f2f4f8`) — the sea recedes into shadow.

Canvas↔island contrast is kept at or above **1.20:1** luminance ratio in both modes. Island header bands sit one step off the island (`#1e1e1e` dark, `#e9ecf1` light).

### Borderless chrome

Main toolbars, view headers, and the sidebar header have **no border** — they are part of the sea. Their surfaces come from `--color-island-header` (bands) or the canvas (chrome), never a 1px line. `--color-chrome-border` is transparent by design.

### Active tab recognition

The selected tab is marked with a filled background **plus** a 2px underline (`--color-primary`), so it can be located at a glance. Applied to the All/Mine segmented control and the sidebar navigation.

## Layout

A modular multi-pane architecture built for widescreen displays and mouse drag-and-drop mechanics, expressed in the Islands grammar above.

- **Root Canvas:** the shell paints the canvas and exposes a `--island-gap` gutter around and between a collapsible organization/repo sidebar (fixed 220px, its own island) and the active view.
- **Master–Detail Views (Inbox / Issues):** A two-column split inside the view — a fixed-width master **feed** column (`360px`) and a flexible **detail canvas** that occupies the rest of the window. The feed stacks two-line issue cards (status dot, `#id`, title, repo slug, reserved-label chips, relative time). The detail canvas is always present and shows an empty state until an item is selected; it renders the issue Inspector Pane or, for staged intake, the submission document with its triage actions.
- **Board View:** Keeps the classic layout — a full-width kanban stream with a fixed `480px` inspector docked on selection.
- **Scale:** Strict 4px base increment (`xs: 4px`, `sm: 8px`, `md: 12px`, `lg: 16px`).
- **Gutter & Containment:** 8px gutters between dense issue cards; 12px internal containment for dialogs and panels.

## Elevation & Depth

Funnel separates areas **by elevation, not by line** (Islands): working surfaces float on the canvas with a visible gap and rounded corners, and structural dividers are expressed as surface steps (`island` → `island-header` → `raised`) rather than borders. Shadows remain reserved for genuinely floating layers:

- **Elevation 0 (Canvas):** Flat base surface (`surface-base`) with inset container borders (`border-subtle`).
- **Elevation 1 (Issue Rows / Cards):** Solid fill (`surface-layer-1`) bound by a 1px border. Hover transitions illuminate the background to `surface-layer-2` with zero layout shift.
- **Elevation 2 (Floating Popovers / Menus):** 12px backdrop blur (Mica/acrylic CSS effect) over semi-transparent surface tokens, bounded by a 1px border (`border-subtle`) and an ambient shadow: `0 8px 24px rgba(0, 0, 0, 0.45)`.

## Shapes

- **Corner Radii:** Islands (sidebar, feed, detail, inspector, board columns) use `10px` (`rounded.island`); nested controls stay at `6px` (`rounded.sm`) so no child exceeds its parent island.
- **Badges & Tokens:** `3px` (`rounded.xs`) for compact repo identifiers, issue numbers, and GitHub tags.
- **Edge Treatment:** Crisp 1px solid hairline borders with no bevels.

## Components

- **Issue Row:** Two-line master-feed card. Line one: a status dot, monospace `#id`, and a truncated title (`13px`) with the relative timestamp at the trailing edge. Line two: the muted `owner/repo` slug on the left and reserved-label chips (status, priority, size) on the right. Rounded `6px` corners with a translucent `rgba(255,255,255,0.05)` hover/active fill.
- **Inspector Pane:** Flexible document canvas within the master–detail split (fixed `480px` when docked to the Board). Breadcrumb action bar (`owner/repo / #id / state`, "opened by … "), a `20px` inline-editable title (`-0.02em`, `1.25`), a **borderless row of icon-first property pills** (status, priority, size, assignee, labels — no container box and no uppercase labels), an open-text description with an `Add a description…` ghost prompt, a comment activity timeline, and a composer pinned to the base.
- **Filter Bar:** In the narrow feed column the six multi-selects collapse behind a single **Filter** button that reveals an anchored panel; the Board keeps the full-width toolbar.
- **Quick-Action Context Menu:** Mouse-driven popup on right-click or row hover, utilizing Acrylic backdrop-filter styling and 6px rounded edges.

## Do’s and Don’ts

- **Do** optimize for mouse precision: provide generous click targets on compact UI via invisible padding bounds.
- **Do** preserve 1:1 parity with GitHub's foundational entities (issues, labels, milestones) while decoupling visual presentation.
- **Do** use monospace typography for every identifier tied to GitHub (`#ID`, branch, commit, tag).
- **Don't** use slow layout transitions or spring animations; keep state changes under 100ms or instant.
- **Don't** use bright accent colors for decorative containers—reserve saturation strictly for status, labels, and destructive alerts.
- **Don't** allow long issue titles to wrap within dense list views; truncate with an ellipsis (`...`) and reveal details via inspector or hover tooltips.
