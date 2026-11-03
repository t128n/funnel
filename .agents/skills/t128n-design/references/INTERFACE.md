# t128n interface design

This reference governs **what a screen contains and why**. [DESIGN.md](DESIGN.md)
and [PATTERNS.md](PATTERNS.md) govern **how it looks**. Read this before
composing a new screen, changing a flow, or reviewing a UI.

DESIGN.md owns tokens, type, color, shells, components, motion, and the visual
treatment of states. This file owns the task, hierarchy, information, copy, and
state model. Where they overlap: this file decides *what* leads; DESIGN.md
decides *how* it is rendered.

## Precedence

When rules conflict, resolve in this order:

1. Accessibility and platform correctness.
2. Task comprehension and operational utility.
3. Interface content, hierarchy, and state.
4. Visual consistency with t128n.
5. Novelty and aesthetic risk.

Visual rules never override 1–3. If a t128n default makes the task harder to
understand or complete, the task wins; note the deviation.

## Four tests

- **Zero decorative padding.** Every pixel, rule, label, and string earns its
  place through dynamic utility or feedback. If removing it costs the user
  nothing, remove it. "The page looks empty" is not a cost.
- **Contextual lifecycle over static boilerplate.** A screen is a state
  machine. Landing copy, onboarding explainers, and meta-chrome belong to the
  state that needs them; they do not follow the user into the operational
  phase.
- **Action over commentary.** Do not narrate what a label, input, or command
  already makes obvious. Spend words on the decision the user is making now.
- **Earned density.** Density is welcome when it exposes real data — dependency
  trees, logs, diffs, audits. Density manufactured from constants, split
  columns, and metadata cards is theater.

If an element carries information, that is not enough. It must be **operational
information**: it changes with state or user input, changes a decision, sits at
the point of use, or is said once. A static fact can still be slop.

## 1. Name the job and the state

- State the screen's one job in a sentence. If you cannot, the screen is not
  ready to lay out.
- The `h1` names the current state, not the product. "Bundle ready" beats
  "Create an offline bundle" once the bundle exists.
- A linear flow is a state machine: idle, running, result, error. Each state
  has one primary outcome and one primary action.
- Landing and empty states may carry the pitch. Active states carry the current
  operation, the result, and the next action. Remove the pitch when the flow
  starts.
- Do not keep a product title, tagline, eyebrow, or explanatory paragraph at
  full strength across every step. It becomes chrome that competes with the
  state.
- The same fact appears once. If the header, sidebar, and result all say
  "browser execution", keep the one at the point of use and delete the rest.

## 2. Separate constants from metrics

A workspace panel is not a specification sheet.

- Constants the user cannot change and that do not change with state are
  **documentation**, not metrics. "Output: .tgz", "Execution: This browser",
  "Install scripts: Disabled" belong in docs, settings, or an about page.
- A second column or panel must carry live, changing, actionable content. If it
  holds only constants or restates the main flow, collapse to one column and
  put the one useful fact inline.
- A badge, status dot, sparkline, or "LIVE" indicator needs a source, a
  consequence, and a place to act. Otherwise it is decoration.
- Warnings must be conditional on a detected condition, not boilerplate. One
  warning, next to the object it affects. If the system can detect native
  binaries or install scripts, inspect them; do not print the same caveat on
  every package.
- Architecture and privacy claims ("runs in your browser", "100% local") belong
  where the user makes that decision, not in the footer beside a commit hash.
- A result artifact — filename, ID, total — is data, not the headline. The
  action that uses it outranks it.

## 3. Write only what the interface needs

DESIGN.md owns case, punctuation, dates, and button grammar. This section owns
whether the copy should exist.

- **Deletion test.** Remove the sentence. If no instruction, consequence, or
  decision is lost, do not put it back.
- **No tautology.** A step titled "Build" does not need the subtitle "Resolve
  and pack". A field labeled "Search" does not need "Search here…" and "Use
  this bar to search your items." One idea, one surface.
- **No ambient instructions.** "Registry access is required to build. One
  package per archive." beside a button is three ideas in the wrong place.
  Move hard constraints into the control or the flow.
- **CTAs name the outcome.** "Export CSV", "Invite teammate", "Download
  bundle" — not "Get started", "Learn more", "Explore".
- **No narrated commands.** The command already shows its syntax. Keep a
  heading; let the command be the instruction.
- **No marketing in app chrome.** A header tagline, footer claim, or hero
  paragraph that repeats what the page already says is noise. Keep one
  statement, in the state that needs it.
- **No eyebrow labels by default.** A tracked all-caps label above every
  heading is visual noise unless it encodes a real grouping the user navigates
  by.
- **Errors and empty states are direction.** Say what happened, why, and what
  to do next. Name the object; do not apologize or blame.
- **One term per concept.** Do not call the same thing a bundle, archive, and
  package in one flow.

## 4. Build hierarchy from the task

- One primary action per state. A dialog or independent section is its own
  scope.
- Hierarchy comes from type, spacing, and one rule before borders, cards, or
  shadows.
- No card-in-card nesting. Every container needs a reason to be a container.
- No default three-column feature grid and no equal-weight KPI dashboard unless
  comparison is the job.
- Use whitespace before hairlines. Dividers separate unlike things; they do not
  decorate every boundary.
- Do not let a utility action share the primary action's weight. "Create
  another bundle" is a ghost or text action; "Download bundle" is primary.
- Real data survives: long names, missing fields, zero, overflow, partial
  results, and errors. Tidy placeholder data hides layout failures.
- A table is page structure, not an object. Do not wrap it in a card.
- If a screen has one task, one column is usually enough. A second column must
  earn its width with live content, not balance the page.

## 5. Design the states and behavior

- The happy path is one state, not the design. Define empty, loading, error,
  partial, long-content, and permission states where they can occur.
- Every affordance works or is visibly inert. No fake filter pills,
  breadcrumbs, status dropdowns, or tabs that lead nowhere.
- Hover, active, focus-visible, and disabled are designed. Keyboard focus is
  never optional.
- Confirm by consequence: destructive and irreversible actions get a dialog;
  save, copy, and archive do not.
- Do not promise a capability the UI does not have.
- Do not add navigation, tabs, or a sidebar for a single-task flow. Navigation
  is for multiple destinations, not for filling a shell.
- Linear one-off flows use the focused shell: one column, current state as
  `h1`, one primary action, no persistent aside for static metadata.
- A result state groups the artifact and its primary action in one surface;
  installation or next steps sit below as a separate phase.

## 6. Review

Run these before the visual checklist in PATTERNS.md. A "no" is a fix, not a
note.

1. Can I name the screen's one job in a sentence?
2. Does the `h1` name the current state?
3. Is every element dynamic, decision-relevant, at the point of use, or said
   once?
4. Is every constant out of the workspace and in docs or settings?
5. Does every second column or panel carry live, actionable content?
6. Does the copy pass the deletion test?
7. Are duplicate warnings, restatements, and narrated instructions gone?
8. Are empty, loading, error, partial, long-content, and permission states
   designed?
9. Does every control do something, and is every inert control visibly inert?
10. Does the result action outrank the artifact metadata?
11. Does the layout survive long names, missing fields, zero, and overflow?
12. Does the screen still make sense with the marketing copy removed?
13. Does a single-task flow use one column and the focused shell?
14. Would a user know what to do in the first three seconds?

## Example: a linear export flow

| State   | `h1`                        | Main content                           | Primary action   |
| ------- | --------------------------- | -------------------------------------- | ---------------- |
| Idle    | Create an offline bundle    | Package picker and constraints         | Create bundle    |
| Running | Building lodash@4.17.21     | Progress and log                       | Cancel           |
| Result  | Bundle ready                | Artifact name, size, download, install | Download bundle  |
| Error   | Bundle could not be created | What failed and how to fix it          | Retry            |

The header carries identity only. The pitch appears in the idle state, not in
running, result, or error. The sidebar is absent unless it shows live resolution
data; constants sit inline under the artifact or in docs. The artifact name and
the download action share one surface; "Create another bundle" is a ghost
action outside it.

## Relationship to other references

- [DESIGN.md](DESIGN.md): tokens, type, color, layout shells, components,
  motion, accessibility, and visual state treatment.
- [PATTERNS.md](PATTERNS.md): copyable markup and CSS for shells, controls,
  forms, tables, dialogs, feedback, and empty states.
- [examples/](examples/README.md): full views; copy patterns, not pages.
