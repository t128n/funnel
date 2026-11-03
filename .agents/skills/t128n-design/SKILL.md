---
name: t128n-design
description: >
  Apply the t128n design language to any interface work: building,
  redesigning, restyling, or reviewing dashboards, admin tools, developer
  tools, settings screens, documentation, landing pages, and personal apps.
  Use this skill whenever the user asks to design, build, style, polish,
  audit, or review UI, even if they do not mention t128n. Covers interface
  content and hierarchy, state design, information architecture, layout,
  typography, color, components, responsive behavior, accessibility, motion,
  and reference implementations. Framework-agnostic.
---

# t128n Design

Use t128n as the default visual language for interface work. Start with
[INTERFACE.md](references/INTERFACE.md) for what a screen contains and why.
Use [PATTERNS.md](references/PATTERNS.md) for copyable component patterns, and
[DESIGN.md](references/DESIGN.md) for the visual specification when you are
making a system-level decision or a rule is unclear.

The canonical token file is [tokens.css](references/tokens.css). Copy it into
the target project, import it before component styles, and consume its custom
properties everywhere.

## Fast path

- **Small component or state change:** use the defaults and snippets in
  PATTERNS.md. Read DESIGN.md only if the rule is unclear. If the change alters
  what the screen contains or which state leads, read INTERFACE.md first.
- **New screen or flow:** read INTERFACE.md first, then the shell and layout
  sections of DESIGN.md, then open the closest view in `references/examples/`.
- **Design review:** run the interface checklist in INTERFACE.md, then the
  visual checklist in PATTERNS.md.

## Defaults

- Structure comes from alignment and 1px `--color-border-subtle` rules, not
  shadows or containers.
- Body is `--font-size-body` Geist Sans; content screens use
  `--font-size-body-content`. Geist Mono is only for code, identifiers, and
  aligned numerals.
- Default controls are `--size-control-md`; page padding is
  `--layout-page-padding`; the app bar is `--layout-app-bar` and the sidebar
  is `--layout-sidebar`.
- One accent: `--color-primary` in content, `--color-accent-on-dark` on the
  app bar.
- Outcomes are inline, never floating notifications.
- Every element must change with state, change a decision, sit at the point of
  use, or be said once. Static facts are documentation, not metrics.
- The `h1` names the current state, not the product.
- A second column must carry live, changing, actionable content; otherwise use
  one column.
- Accessibility and platform conventions outrank visual consistency.

## Tokens

- The token file is the only source of literal color and size values.
- Namespaces: `--color-*`, `--font-*`, `--space-*`, `--size-*`, `--layout-*`,
  `--radius-*`, `--shadow-*`, `--motion-*`, and `--z-*`.
- Component CSS must consume tokens for color, type, spacing, control and row
  size, layout dimensions, radius, motion, and z-index. Do not write raw hex,
  rem, or px values in component declarations.
- Allowed literals outside the token file: 1px hairlines, 2px focus rings and
  indicators, breakpoints, shadow geometry, and `<meta name="theme-color">`.
- Documentation pages may display token values as content. Component CSS may
  not.
- Local token overrides are allowed only when they reference other tokens,
  such as a denser page padding on mobile. Never redefine a token with a
  literal.
- If a needed dimension has no token, add a named token to the token file
  first, then consume it. Do not create a second token layer or duplicate the
  token block in component files.
- When the project uses Tailwind, CSS-in-JS, or another theme layer, map the
  same names into that layer. Keep one source of truth.

## Workflow

1. Inspect the existing application.
   - Identify the framework, component library, and design constraints.
   - If the project already has an explicit visual system or brand, preserve
     it and use t128n where it does not conflict.
   - Reuse existing components and preserve working behavior.

2. Define the interface.
   - Name the screen's one job and its current state.
   - List the states the screen must cover: empty, loading, error, partial,
     long content, permission.
   - Decide what is live data, what is a constant, and what is copy. Remove
     constants from the workspace and remove copy that does not change a
     decision.
   - Read INTERFACE.md before choosing a layout.

3. Choose the shell.
   - App shell for dashboards and multi-section tools.
   - Content shell for landing pages, docs, and personal sites.
   - Focused app shell for a single-purpose surface.
   - A linear one-off flow uses the focused shell and one column.
   - Do not add navigation or containers the information architecture does
     not need.

4. Apply the visual language.
   - Copy `references/tokens.css` into the project and import it before
     component styles.
   - Consume namespaced tokens for every color, type, spacing, size, layout,
     radius, motion, and z-index value.
   - Never hardcode raw hex or sizing literals in component CSS. Add a token
     instead.
   - Use Lucide outline icons inline as SVG.
   - Build hierarchy with alignment and whitespace, not decoration.

5. Use the reference views when composition is unclear.
   - Start at [references/examples/README.md](references/examples/README.md).
   - Read `index.html` and `styles.css` for layout and appearance.
   - Read `app.js` only when the interaction behavior matters.
   - Copy patterns, not whole pages.

6. Implement with the existing stack.
   - Prefer the project's component library and accessible platform
     primitives.
   - Keep application-specific components local.
   - Do not add a UI framework or dependency just for visual consistency.

7. Review the result.
   - Run the interface checklist in INTERFACE.md first.
   - Then run the visual checklist in PATTERNS.md.
   - Check keyboard order, focus visibility, and 320px layout.
   - Test empty, loading, error, partial, long-content, permission, success,
     and destructive states.
   - Remove anything that does not change a decision, enable an action, or
     report state.

## Examples

Six full static views show the system applied to different shells and tasks.
They are references, not templates; the UI is complete even where behavior is
not wired up. In shipped work, every affordance must work or be visibly inert.

| View | Shell | Useful for |
| --- | --- | --- |
| [`landing/`](references/examples/landing/index.html) | Content | Marketing hierarchy, hero composition, copy confirmation |
| [`personal/`](references/examples/personal/index.html) | Content | Ruled lists, monospace identifiers, no navigation |
| [`dashboard/`](references/examples/dashboard/index.html) | App | Dense tables, sorting, filters, empty states, row menus |
| [`settings/`](references/examples/settings/index.html) | App, single column | Form validation, inline success, destructive dialogs |
| [`docs/`](references/examples/docs/index.html) | Content | Reading measure, code blocks, callouts, tables, TOC |
| [`workspaces/`](references/examples/workspaces/index.html) | Focused app | Search-first launcher, inline create, keyboard shortcuts |

Open any `index.html` directly. There is no build step and no runtime
dependency.

## Rules

- INTERFACE.md governs what appears and why; DESIGN.md governs how it looks.
  Accessibility, task comprehension, and interface content outrank visual
  consistency.
- DESIGN.md is the visual reference, not an instruction to rebuild the
  application architecture.
- Accessibility, platform conventions, and existing product behavior take
  precedence over this document.
- Prefer existing components over new abstractions.
- Treat design defaults as defaults, not absolute rules.
- A single-task flow stays a single column. Do not add an aside or panel for
  static metadata.
- Do not present constants as metrics.
- Keep one token file. Do not duplicate token blocks across stylesheets.
- Do not add dependencies solely for visual consistency.
- Do not create a design-system implementation package.
- Deviate when product requirements justify it; note the reason.

## Output

Implement the requested UI changes directly. For design reviews, report
concrete problems and actionable improvements, prioritized by impact. Avoid
unrelated abstractions or refactors.
