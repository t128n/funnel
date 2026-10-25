# Design principles

Funnel's interface exists to make a dense issue cockpit scannable, stable and fast to operate. Those goals are not local taste: Funnel applies a shared [design system baseline](../plans/2026-10-25-design-system-baseline.md), and [`docs/DESIGN.md`](../DESIGN.md) is the application profile that binds the baseline to Funnel's records, vocabulary and views.

This page explains the thinking behind that profile. It is not the rulebook; the baseline and the profile are normative. Read this page to understand *why* the rules are shaped the way they are, and read the profile when you need the exact value, mapping or constraint.

## One baseline, one application profile

The baseline settles the questions every app would otherwise answer differently: what a record is, how density is achieved, when colour is allowed, how state is displayed, what accessibility floor applies, and how exceptions are governed. It is deliberately app-agnostic. It fixes meaning and constraints, not a component catalogue.

Funnel supplies the missing specifics in its application profile: issues are the records, the register is the primary view, the board is a secondary projection, and the status vocabulary maps to fixed semantic roles. The split matters because it prevents two failure modes. A baseline that hard-codes one app's vocabulary becomes a theme rather than a system. An app that invents its own rules drifts the moment a new view is added.

The profile is therefore specific but not independent. It may narrow a baseline rule; it may not relax one. When the two disagree, the baseline wins and the profile is corrected.

## Records over cards

The issue register is the product. Work is read in rows and columns: identifier, title, status, priority, labels, size, update time and assignee. The register is a table, not a collection of framed cards, because comparison is the job. A row that lines up with its neighbours lets the eye move down a column instead of re-learning a layout.

Two consequences follow. First, the header and every row share one column geometry, so a short title or a missing field cannot shift the columns. Second, a record must be intelligible on its own. Status, priority and identifier belong to the record, not only to a column header or a group heading.

The board is where this principle is easiest to get wrong. It is a spatial projection of the same records, useful for seeing movement between stages — not a separate card system. Lanes are open tracks of flat, row-like records with the same field anatomy as the register. A card still writes its status in text even when the lane already names the state, because a record that loses its identity when detached from its container is a card, not a record. Cards remain for navigation, unstructured summaries and empty states.

## Text before colour

State is written first. A status badge must be readable without colour, which is why Funnel renders words — Backlog, To Do, In Progress, In Review, Done, Blocked — and treats the role colour as support. Priority follows the same rule: `P1`, `P2` or `P3` in text, with danger, warning or neutral tinting the text rather than replacing it.

This is an accessibility requirement and a comprehension one. Colour-only meaning excludes colour-blind users, fails in monochrome screenshots, and collapses when a theme changes. Written state survives all three. It also makes the vocabulary explicit: "Done" is a better label than a green dot, and "Blocked" is a better label than red.

Colour is correspondingly narrow. It is reserved for state, links, focus and destructive actions, with one accent. Tags, categories and free-form labels are monochrome. GitHub label colours remain in the mirror as data; they never drive the interface, because imported colour is not Funnel's semantic vocabulary.

## Flat surfaces, truthful hierarchy

Separation comes from 1px rules, background tints and spacing. Surfaces are white or tinted. Records, lists and chrome carry no shadows, gradients, translucency, glass or large radii. An overlay may use one soft shadow when the dimmed backdrop is not enough to separate it.

The reason is hierarchy. Shadows imply layers that do not exist: a row hovering above a table is not a different level of the system, it is the same row with a pointer over it. When containers carry elevation, they compete with the content, and emphasis has to escalate to stay visible. Flat surfaces leave one loud state — focus — and a small set of semantic colours with nothing to outshout.

Flatness is also honest about interaction. Hover changes a tint or a border; it does not lift, scale or move anything. Overlays are separated by a border and a dimmed backdrop. Selection is a tint and an accent edge. All three are visible in a screenshot, legible at low contrast and stable under `prefers-reduced-motion`.

## Density from spacing

Maximum density is the default, but density is bought with spacing, row height and column width — not with smaller type. Body text has a floor of 12px, dense secondary cells may use 11px, and non-essential metadata may use 10px. Nothing goes below that.

The register's discipline is what makes the density usable. Rows share a fixed rhythm, titles truncate by rule, labels beyond the visible count collapse into a counter, and missing values are shown as an explicit dash. A user scans a hundred issues without re-learning the layout on each one. The cost is disclosure: some detail waits for a tooltip, the inspector or the detail record, and the profile says so rather than pretending the row shows everything.

Density is bounded by accessibility. If a tighter row would reduce contrast, shrink a target below the floor or hide focus, it is not denser — it is broken. The profile makes that ordering explicit: accessibility yields to nothing.

## Native and keyboard-first

Controls behave like browser controls. Native selects, inputs, checkboxes, radios and buttons are preferred; custom controls must match native semantics and keyboard behaviour, or they are replaced. This is not conservatism for its own sake. Native controls carry platform conventions, assistive-technology support and keyboard behaviour that a custom widget has to re-earn.

Keyboard access is a first-class navigation mode, not a fallback. Global shortcuts cover search, new issue, the sidebar and settings; the board adds roving focus and status changes; rows respond to `Enter` and `Space`. Bindings are declared once, so hint text and behaviour cannot drift, and the full map lives in [Use the keyboard](../how-to/use/keyboard.md).

Keyboard-first shapes layout as much as behaviour. Rows must be focusable as rows rather than as a chain of tiny controls, the board needs a single tab stop with arrow traversal, and focus must be clearly visible on quiet surfaces. Hover is an enhancement throughout: every action it reveals is also reachable by keyboard and visible on focus.

## No decorative motion

Motion exists only to explain a change or preserve spatial continuity. A drop location is shown with an insertion line; a theme change does not animate the page; rows do not fade in, and hovering does not move them. `prefers-reduced-motion` is respected, and motion never delays work.

The restraint follows from the rest of the system. If hierarchy is carried by rules, tints and alignment, animation has no structural job left. Pressing it into service as polish would make a fast tool feel slower and would create a second, less reliable way to understand state.

## Light first, dark equal

Light is the canonical theme and gets the exact palette. Dark is a fully supported derivation with the same roles and hierarchy, not a separate design and not an afterthought. Neither theme may be the only one that is checked.

The profile fixes the light values; the dark theme reuses the same semantic roles with contrast-adjusted values. Status must remain readable in both, focus must remain visible in both, and no surface may depend on a tint that disappears when the theme flips. Theme choice is a user setting, not a statement about which mode the product is designed for.

## Accessibility is the floor

WCAG 2.2 AA is the minimum, alongside full keyboard operation and reduced-motion support. Contrast, focus visibility, target size and readable text are not negotiable against density. Tables need headers and accessible names, fields need persistent labels, and status is never colour-only.

The floor is stated as a floor because accessibility is easy to treat as a review gate that can be waived late. In this system it constrains the earlier decisions: it is why type has a minimum, why metadata is monochrome plus text, why custom controls are rare, and why density has a hard stop.

## Full mobile parity

Every view and action works on mobile. The layout may change — horizontal scroll with a sticky key column, stacked key-value rows, drill-down to the full record — but the information and actions do not. Cards are not the mobile fallback for a register, and nothing is hidden because the viewport is narrow.

Parity is a design constraint, not a responsive afterthought. It keeps the register honest: if a column cannot survive a narrow screen, the record probably depends too much on its container. It also keeps the shell honest, since settings, the attention queue, the board and the shortcuts must remain reachable at mobile widths.

## Explicit state and governance

Every user-visible change has a named action, an actor and an audit trail. Background work may exist, but its effects are visible and attributable. Silent mutation of issues, settings or state is a defect.

The same posture governs the design system itself. The baseline is a contract; exceptions require a written rule, reason, scope, owner and review date, and they are listed in the application profile. New roles, type sizes, colours or geometry need a baseline revision, not a local decision. That is slower than inventing a one-off style, and it is the point: the system stays legible because its deviations are legible too.

## What the profile trades away

The system is opinionated and the opinions have costs. Truncation and disclosure hide long titles and extra labels until a tooltip or the inspector. Flat surfaces can feel plain on a first visit, and they leave little room for visual flourish. Keyboard-first navigation assumes a user who will invest in learning the keys; hints lower the curve but do not remove it. Mobile parity constrains layout choices that a desktop-only design would take for granted.

These costs are accepted because the cockpit is used repeatedly by the same small team, not visited once by a stranger. Positional memory, low visual noise and fast keyboard actions compound over a working day. The baseline and the profile exist to stop each new feature from trading those gains for a locally prettier screen.

## Related

- [Funnel design system — application profile](../DESIGN.md) — records, status mapping, views and exceptions.
- [Design system baseline](../plans/2026-10-25-design-system-baseline.md) — the parent principles and normative rules.
- [Use the keyboard](../how-to/use/keyboard.md) — the complete shortcut map and navigation model.
- [Workflow model](./workflow-model.md) — status, priority, size, blocking and Done as separate concepts.
- [Architecture](./architecture.md) — the read path and event flow that keep these views current.
