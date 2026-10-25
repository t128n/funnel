# Design system baseline — principles and normative rules

- **Status:** Approved 2026-10-25
- **Date:** 2026-10-25
- **Scope:** all web apps
- **Relationship to existing docs:** this is the parent system. `docs/DESIGN.md` becomes an application profile for Funnel, not the baseline.
- **Out of scope:** marketing sites, documentation sites, native desktop/mobile apps, component APIs and code implementation.

## 1. Purpose

One baseline for every web app: a small set of principles and hard rules that decide what an interface is allowed to look like and how it must behave. It fixes meaning and constraints, not a component catalogue.

An app adopts the baseline through a short **application profile**: its records, its status vocabulary mapped to shared roles, its transitions, its mobile table strategy and any documented exceptions.

## 2. What “BMO-like” means here

BMO-like is not a colour theme. It is three layers that must agree:

1. **Structure.** Structured records are tables or key-value grids. Data is read in rows and fields, not decorative cards.
2. **Surface.** Flat, dense, neutral and explicit. 1px rules, background tints, text states. No elevation, gradients, glass or ornament.
3. **Behaviour.** State transitions are explicit and auditable. Nothing user-visible changes silently. The interface prefers visible history and named actions over hidden automation.

If a choice satisfies the surface but not the structure or behaviour, it is not BMO-like.

## 3. Foundational principles

### 3.1 Records over cards

Structured data is displayed as table rows or key-value grids. Cards are reserved for navigation, summaries of unstructured content, empty states and genuinely spatial views. A card grid is never the primary representation of a record set.

**Therefore:** a record must remain understandable when detached from its container. State, identity and key fields belong to the record, not only to a column header or group label.

### 3.2 Data over chrome

Chrome never competes with data. No decorative containers, coloured shells, illustrations, gradients or ornamental icons in data views. Hierarchy comes from alignment, weight, rules and background tint.

**Therefore:** if a border, shadow or icon does not carry information, remove it.

### 3.3 Density is spatial

Maximum density is the default. Density comes from tight spacing, row heights, gaps and column widths — not from shrinking text below a readable floor.

**Therefore:** body text has a floor; metadata may be smaller; nothing goes below the absolute minimum. Density never justifies unreadable type.

### 3.4 Text before colour

State is written in text first. A status badge must be readable without colour. Colour supports the label; it never replaces it.

**Therefore:** no icon-only status, no colour-only meaning, no “the red one means blocked.”

### 3.5 Colour is semantic

Colour is reserved for state, links, focus and destructive actions. One accent. Neutral surfaces and monochrome metadata everywhere else.

**Therefore:** tags, categories and free-form labels are monochrome. Priority and severity are states and may use the semantic roles.

### 3.6 Type is native and functional

UI text uses the native system sans-serif stack. Monospace is reserved for technical identifiers, hashes, code, diffs, logs and numeric columns where alignment matters. No serif UI, no display face, no brand typography in the product.

**Therefore:** hierarchy comes from weight, size within a narrow scale, and 1px rules — not from a second typeface.

### 3.7 Surface is flat

Surfaces are white or tinted. Separation comes from 1px solid rules, background contrast and spacing. No shadows, gradients, translucency, glass, large radii or pills.

**Therefore:** overlays are separated by a border and a dimmed backdrop, not by elevation.

### 3.8 Interaction is native-feeling and keyboard-first

Controls behave like browser controls. Every action is reachable by keyboard. Hover is an enhancement, never the only way to discover or perform an action. Custom controls are allowed only when native controls cannot express the interaction, and must match native semantics.

### 3.9 Motion is information

No decorative motion. Motion exists only to explain a state change or preserve spatial continuity. It must respect `prefers-reduced-motion` and must never delay work.

### 3.10 Accessibility is a floor

WCAG 2.2 AA is the minimum, plus full keyboard operation and reduced-motion support. Density yields to contrast, focus visibility, target size and readable text. Accessibility is not an exception process.

### 3.11 Light first, dark equal

Light is canonical and gets the exact palette. Dark is a fully supported derived theme with the same roles and hierarchy. Neither theme may be an afterthought.

### 3.12 Full mobile parity

Every view and action works on mobile. Mobile may change the layout — horizontal scroll, stacked key-value, drill-down — but not the available information or actions. No feature is desktop-only.

### 3.13 Explicit state, no hidden automation

Every user-visible state change has a named action, an actor and an audit trail. Background work may exist, but its effects must be visible and attributable. No silent mutation of records, settings or state.

### 3.14 Hard rules, documented exceptions

The baseline is a contract. Exceptions require a written rationale, a scope, an owner and a review date. Silent deviation is a defect, not a style choice.

## 4. Decision record

| Decision | Choice |
|---|---|
| Platform scope | Web apps only |
| Character | BMO-like: structure + surface + behaviour |
| Density | Maximum everywhere; spacing and layout, not type size |
| Records | Table or key-value grid; cards only for navigation or unstructured content |
| Typography | System sans only; monospace for technical identifiers |
| State labels | App-owned vocabulary mapped to fixed semantic roles |
| State display | Text badges everywhere; colour supports, never replaces |
| Metadata colour | Monochrome tags and categories |
| Colour role | State, links, focus and destructive actions only; one accent |
| Surface | Strict tabular flat: 1px rules, tints, no shadows, 0–3px radius, no pills |
| Theme | Light-first, dark parity |
| Motion | None except state feedback; reduced-motion respected |
| Interaction | Native-feeling, keyboard-first |
| Accessibility | WCAG 2.2 AA + keyboard + reduced motion |
| Responsive | Full mobile parity |
| Governance | Hard rules, documented exceptions |

## 5. Normative rules

### 5.1 Structure and data

- Structured records **MUST** be presented as table rows or key-value grids.
- A record set **MUST NOT** be presented primarily as cards.
- Cards **MAY** be used for navigation, summaries of unstructured content, empty states and spatial overviews that are secondary to the register.
- A record **MUST** carry its own identity and state. It must not depend on a column header, group heading or surrounding container to be understandable.
- Tables **MUST** have a header row, aligned columns and 1px row separators. Header and row cells share the same column geometry.
- Numeric columns **MUST** be right-aligned and use tabular numerals.
- Missing values **MUST** be shown explicitly, not left as ambiguous blank space.
- Long values **MUST** truncate or wrap by a defined rule; they must not push neighbouring columns out of alignment.
- Detail views **MAY** expand a record, but the register **MUST** remain usable without opening every row.

### 5.2 Density and spacing

- Default table cell padding: 3–6px vertical, 4–8px horizontal.
- Default input/select padding: 2–4px vertical, 4–8px horizontal.
- Section spacing: 8–12px. Row gaps: 4–8px.
- Page framing **MUST NOT** use large decorative whitespace. Whitespace is structural, not atmospheric.
- Body text **MUST** be at least 12px. Dense secondary cell text **MAY** be 11px. Non-essential metadata **MAY** be 10px. No text below 10px.
- Line-height: 1.2–1.3 for data and labels; long-form prose **MAY** use 1.4 when required for readability. It does not get a larger type ramp or a serif face.
- Density **MUST NOT** be achieved by reducing contrast, target size or focus visibility.

### 5.3 Typography

- UI font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`.
- Monospace stack: `Consolas, Menlo, Monaco, "Courier New", monospace`.
- Monospace **MUST** be limited to identifiers, hashes, code, diffs, logs and aligned numeric data. It is not a general table font.
- Page title / H1: 16–18px, bold.
- Section header / H2: 13–14px, bold, with a full-width 1px rule.
- Body / field labels / cell data: 12px default; 11px for dense secondary cells. Field labels are bold; values are normal.
- Fine print / metadata: 10–11px.
- Uppercase **MAY** be used for short labels, table headers and status badges. It **MUST NOT** be used for sentences or long labels.
- Hierarchy **MUST** come from weight, 1px rules and background tint, not from a wide size range or a second typeface.
- Links **MUST** be distinguishable by underline, not colour alone.

### 5.4 Colour and state

- Canvas: `#ffffff`.
- Table header / section tint: `#f0f0f0` or `#e8e8e8`.
- Row alternation / fieldset fill: `#f7f7f7`.
- Border: 1px solid `#d2d2d2` or `#cccccc`.
- Active/focus: `#0060df`.
- Primary text: `#222426` or `#000000`.
- Secondary text: `#555555`.
- Link: `#0060df`; hover: `#003eaa`.
- One shared accent. Apps **MUST NOT** introduce a second brand accent.
- Semantic roles are fixed:

| Role | Meaning | Working pair |
|---|---|---|
| Neutral | New, unknown, unstarted, no state | `#4a5568` on `#f0f0f0` |
| Info | Informational, not yet active | `#004085` on `#cce5ff` |
| Progress | Active, assigned, in progress | `#0c5460` on `#d1ecf1` |
| Success | Done, resolved, approved | `#155724` on `#d4edda` |
| Warning | Needs attention, at risk, overdue soon | `#856404` on `#fff3cd` |
| Danger | Blocked, failed, invalid, destructive | `#721c24` on `#f8d7da` |
| Disabled | Inactive, unavailable, archived | `#555555` on `#e8e8e8` |

- Apps **MUST** map their own status labels to these roles and document the mapping.
- Apps **MUST NOT** invent new state roles without a baseline revision.
- Status **MUST** be displayed as text. Colour is supplementary.
- Tags, categories and free-form labels **MUST** be monochrome.
- Priority and severity are states; they **MAY** use the semantic roles. They **MUST NOT** introduce an arbitrary colour scale.
- Colour **MUST NOT** be the only carrier of meaning. Every coloured state also has a text label, icon with accessible name, or pattern.
- Dark theme **MUST** preserve the same roles and hierarchy with adjusted contrast. It is not a separate palette.

### 5.5 Surface and geometry

- Border radius: 0px default; 2–3px maximum on inputs and buttons. No pills.
- Shadows: none on records, lists and chrome. An overlay (dialog, popover, menu) may use one soft shadow only when the dimmed backdrop is insufficient to separate it; shadows are never used for hierarchy.
- Gradients: none.
- Translucency/glass: none in product surfaces.
- Borders: 1px solid. Section headers carry a full-width rule.
- Overlays (dialogs, popovers, menus) **MUST** separate themselves with a border and a dimmed backdrop, not elevation.
- Hover **MAY** change background tint or border colour. It **MUST NOT** add elevation, scale or movement.
- Selected rows **MUST** be marked with a background tint and/or a 1px accent edge, not a shadow.
- Icons are functional only. An icon **MUST** have a text label or accessible name. Decorative icons are prohibited.

### 5.6 Interaction

- Use native form controls where possible: `<select>`, text inputs, checkboxes, radio buttons and buttons.
- Custom controls **MUST** match native keyboard behaviour and semantics. If they cannot, use the native control.
- Every action **MUST** be keyboard reachable. Focus order follows reading order.
- Focus **MUST** be visible: a clear accent outline with offset, never removed.
- Hover **MUST NOT** be the only way to discover or perform an action.
- Destructive actions **MUST** name the object and require explicit confirmation.
- Loading, empty and error states **MUST** be textual and explicit. No spinner-only states.
- Tables and grids **SHOULD** support arrow-key navigation where they behave like a control surface.
- Shortcuts **MUST** be discoverable and documented. They must not be the only way to perform an action.
- Background work **MUST** be visible or auditable. No silent mutation.

### 5.7 Accessibility

- WCAG 2.2 AA is the floor.
- Full keyboard operation, visible focus and no keyboard traps.
- Target size: at least 24×24 CSS px; 44×44 preferred on touch surfaces for primary actions.
- Contrast: 4.5:1 for body text, 3:1 for large text and UI boundaries.
- The interface **MUST** work at 200% zoom and reflow without loss of content or function.
- `prefers-reduced-motion` **MUST** be respected.
- Tables **MUST** have proper headers and captions or accessible names.
- Form fields **MUST** have persistent labels, not placeholder-only labels.
- Status **MUST NOT** be conveyed by colour alone.
- Density **MUST** yield to any of the above.

### 5.8 Responsive behaviour

- Every view and action **MUST** work on mobile. No desktop-only features.
- Tables on narrow screens **MUST** use one of:
  - horizontal scroll with a sticky key column;
  - stacked key-value rows with persistent field labels;
  - drill-down from a compact row to the full record.
- Card fallbacks **MUST NOT** replace record tables on mobile.
- Information **MUST NOT** be hidden on mobile. Reorganise, do not remove.
- Touch targets follow the accessibility floor. Density may decrease only where touch requires it.

### 5.9 Content and voice

- App chrome uses terse, explicit nouns and verbs. No marketing voice inside the product.
- State labels are explicit and app-owned. “Done” is better than a green dot.
- Errors state what happened, why, and the next action.
- Empty states say what is missing and what to do next.
- Dates, numbers and identifiers are formatted consistently. Identifiers use monospace.
- No decorative copy, no filler, no unexplained abbreviations.

### 5.10 Governance

- Each app **MUST** have a one-page application profile covering records, status mapping, transitions, mobile strategy and exceptions.
- Exceptions **MUST** record: the rule, the reason, the scope, the owner and the review date.
- New shared roles, type sizes, colours or geometry require a baseline revision.
- App-specific components **MAY** exist; they **MUST** use the baseline tokens and rules.
- A design review checks the application profile and the interface against this document.

## 6. Application profile template

```text
App:
Owner:
Records:
Primary view:
Secondary views:
Status vocabulary -> role mapping:
Allowed transitions:
Priority / severity mapping:
Metadata / tag treatment:
Mobile table strategy:
Documented exceptions:
Review date:
```

## 7. Funnel as an application profile (non-normative)

This is an example of applying the baseline, not part of it.

- **Records:** issues.
- **Primary view:** issue register/table; the board is a secondary spatial projection, not a card system.
- **Status mapping:** backlog → neutral; todo → info; in progress → progress; in review → progress; done → success; blocked → danger.
- **Priority / severity:** P1 → danger; P2 → warning; P3 → neutral.
- **Metadata:** labels and categories monochrome. GitHub label colours do not drive status.
- **Surface:** strict tabular flat; no rounded cards, hover elevation, shadows or pill badges.
- **Typography:** system sans for UI; monospace for issue IDs, revisions, hashes and diffs.
- **Board:** lanes of compact, row-like records using the same field anatomy. It may be spatial, but it is not a card grid.
- **Preserved from current Funnel:** keyboard-first interaction, fixed grid discipline, monospace identifiers, light/dark parity.
- **Retired where conflicting:** Inter as the UI face, layered card surfaces, hover elevation, decorative icon states, label-driven status colours.
- **t128n.dev:** only its flatness, 1px rule discipline, link treatment, table header/row rule hierarchy, uppercase table headers and right-aligned numerics survive, expressed with this baseline’s 1px rules. Its serif body, monospace headings, 16px/1.68 reading rhythm, 65ch measure and generous spacing are rejected by the density and typography principles.

## 8. Non-goals

- Marketing sites, documentation sites and personal sites are not governed. They may borrow tokens.
- Native desktop and mobile apps are not governed.
- A component API, CSS package or code migration is not defined here.
- A fixed cross-app status vocabulary is not defined. Apps own labels and map them to shared roles.
- Charts and data visualisation are not covered yet.
- Brand identity, logo, illustration and marketing voice are not covered.

## 9. Assumptions and open decisions

These are the defaults used in this draft. They are the points to challenge at approval.

1. **One shared accent.** All apps use the same accent (`#0060df`) rather than per-app accents.
2. **One shared identity.** Apps share the system’s visual identity; differentiation comes from the app name and content, not a new palette or typeface.
3. **Navigation is app-owned.** The baseline governs content surfaces and interaction, not the global shell.
4. **Mobile tables use scroll or stacked key-value.** Cards are not a record fallback.
5. **Form labels:** right-aligned on wide key-value forms, stacked on narrow screens.
6. **Body floor:** 12px default; 11px for dense secondary cells; 10px for non-essential metadata.
7. **Dark theme:** derived from the light roles with contrast-adjusted values; exact values still to be fixed.
8. **Charts and data visualisation** are out of scope for this baseline.

## 10. Review checklist

An app conforms when all of these are true:

- [ ] Structured records are tables or key-value grids, not cards.
- [ ] Every record carries its own identity and state.
- [ ] State is text-first and readable without colour.
- [ ] Colour is used only for state, links, focus and destructive actions.
- [ ] Tags and categories are monochrome.
- [ ] Density comes from spacing, not from text below the floor.
- [ ] The UI uses the system sans and the monospace stack as specified.
- [ ] Surface is flat: 1px rules, 0–3px radius, no shadows, gradients or pills.
- [ ] Every action is keyboard reachable and focus is visible.
- [ ] Motion is absent except state feedback, and reduced motion is respected.
- [ ] WCAG 2.2 AA, keyboard and reduced motion pass.
- [ ] Every view and action works on mobile without hidden information.
- [ ] The app has an application profile and documented exceptions.

## 11. Approval

This draft is the baseline to approve or amend. No implementation or migration starts until it is approved.
