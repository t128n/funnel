# Design principles

Funnel's interface standards exist to make a dense issue cockpit scannable, stable and fast to operate, rather than merely tidy.

## A standards document, not a mood board

[`docs/DESIGN.md`](../DESIGN.md) is deliberately short and prescriptive. It is organised in four parts: core principles, global tokens, view patterns, and interaction standards. It does not describe a brand or a visual mood; it describes the rules that keep a data-heavy interface from drifting into inconsistency as features are added.

That structure is itself a design decision. The core principles explain the intent — density without clutter, rigid grids, subtle surfaces, zero redundancy. The token section fixes the vocabulary (surfaces, type sizes, priority and size colours). The view patterns translate the vocabulary into board, list and triage layouts. The interaction section covers keyboard navigation, drag feedback and hit targets. Read top to bottom, it moves from *why* to *what* to *how*; read as a reference, each section can be applied independently.

The standards are written for implementation. They name concrete row heights, grid tracks and colour values because vague advice such as "make it clean and modern" does not survive contact with a real data set. The cockpit components follow the same approach: `IssueRow.svelte` shares one grid template with its sticky header, `BoardCard.svelte` uses a fixed-slot stack, and `AttentionRow.svelte` is a flattened single line. The design document is the argument; the components are the working example.

## Density comes from alignment, not compression

"High information density without clutter" is the first principle, and the qualifier is the important part. Density is achieved by fitting more *usable* rows on screen, not by shrinking text until it becomes unreadable or by stacking unrelated facts into the same space. The list view uses a fixed row rhythm and a small number of predictable columns. The board gives every card the same anatomy. The triage view reduces a blocked issue to one line with a fixed trailing metadata tray.

The practical result is that a user can scan a hundred issues without re-learning the layout on every row. Alignment does the work that whitespace would otherwise do in a less dense design: the eye follows columns, not borders. The standards are also honest about the cost. Titles are single-line in the list and truncated at two lines on cards; labels beyond the first two collapse into a `+N` counter; some metadata disappears entirely at narrow widths. Density is bought with truncation and disclosure, not with ambiguity.

The opinion behind this is that a cockpit is a tool for repeated use, not a marketing page. A first-time visitor may need a moment to learn the columns; a daily user should never need to hunt for the priority, the identifier or the assignee.

## Rigid grids keep the eye still

The second principle — rigid grids over variable stacks — is the mechanical foundation of the first. Data views must align columns across rows, and elements must not shift because a title is short or a field is missing. The list is implemented as a CSS grid with reserved slots for status, identifier, title, labels, priority, size, updated time and assignee. The same `.issue-grid` is used by the sticky header, so the header and every row stay in lock-step. A container query switches the compact and wide templates, revealing the labels track only when there is room; it does not let individual rows reflow.

The board applies the same idea vertically and horizontally. Columns are open tracks — a divider and padding, not a heavy framed card — so the lane itself is the structure. Cards reserve fixed slots for priority, size and assignee, while the optional label track flexes between them instead of pushing the size badge around. A card with no priority still reserves the priority slot, which is why the column stays readable rather than collapsing into a ragged left edge.

The anti-pattern the standard rejects is the content-driven flex row: it looks acceptable with sample data and becomes a different layout on every real issue. Rigid grids cost some flexibility for unusual content, but they buy positional memory. After a day of use, the user knows where to look without reading the row.

## Subtle surfaces, loud signals

Contrast is created with layered background tones and faint translucent borders, not with thick outlines or colourful card shells. The token layer in `src/lib/styles/global.css` mirrors this: a canvas tone, a resting card tone, a hover tone, and border/divider values derived from the foreground at low opacity. The standard's dark-mode values are the canonical example — `#0d0e11`, `#18191d`, `#1e2025` and borders around 6–8% white — and the same semantic tokens carry into the light theme.

The reason is hierarchy. When every card has a border, the borders compete with the content and the interface starts to look like a wireframe. When surfaces differ only slightly, emphasis can be reserved for things that actually need attention: an overdue marker, a priority colour, a conflict warning, a focus ring. The attention view follows this rule literally: urgency is a narrow leading stripe and a tinted pill, never a full-width coloured box. The row border stays neutral so the eye is drawn to the signal, not the container.

Subtlety is not the same as low contrast. Text contrast, focus rings and hit areas still have to meet accessibility expectations. The standard's focus ring — a visible accent outline with an offset — is part of the same system: quiet surfaces make the one loud state, focus, unambiguous.

## Zero visual redundancy

The fourth principle is the one most often violated by issue trackers: do not repeat data. If a column header already says "In Progress", every card in that column does not need a status icon. If a row is grouped under a status section, the row does not need to repeat the status glyph. If a reserved label is rendered as a dedicated priority or size affordance, it should not also appear as a generic tag. If the project shortcode is `FIT`, the card should say `FIT-12`, not the full `owner/repository` path.

The implementation encodes these rules rather than leaving them to taste. `BoardCard.svelte` filters canonical labels out of the generic label list and does not render a status icon. `IssueRow.svelte` hides the status glyph when the list is grouped by status. Both slice non-reserved labels to two and show a counter for the rest. The repository context is a shortcode resolved from settings, with the full path available in a tooltip where it is genuinely needed.

Redundancy is not only ugly; it consumes the scarcest resource in a dense view, which is attention. Every repeated fact is another thing to skip. The trade-off is that the interface relies on context: a card removed from its column, or a row removed from its group, carries less self-description. That is acceptable because the cockpit's views are designed to preserve context, and because the detail inspector exists for the cases where the full picture is needed.

## Priority and size are scan anchors

Priority and size get their own visual language because they are the two fields a user scans before reading a title. The standard fixes a small container, a minimum stroke weight and a scale that remains visible even at zero: an unprioritised issue shows a placeholder rather than nothing, so the column geometry survives. Size uses monospace, uppercase text with translucent fills, which makes `S`, `M` and `L` legible at a glance and visually distinct from labels.

The components make a deliberate distinction between contexts. The compact priority glyph is icon-only with a 1.5px stroke, because a list row already has a priority column header to explain it. The framed `PriorityBadge` reserves an 18px target so the slot does not collapse when priority is absent. On a board card, priority is rendered as a tinted `P0`–`P3` pill (P0 reads **Urgent**), because there is no column header in the card's metadata tray to give a bare glyph meaning. Same data, different affordance, chosen by context rather than by decoration.

This is a small example of the larger principle: the visual system is allowed to vary by view when the informational context changes. Consistency does not mean every field looks identical everywhere; it means the same field means the same thing and occupies a predictable place.

## Three views, three rhythms

The standards describe three view patterns because the cockpit supports three kinds of work.

**Board.** The board is for moving work through stages. It uses open vertical tracks, a column header that carries the status and count, a hover-revealed add action, and cards with a uniform minimum height. The column header owns the status, so the card does not repeat it. WIP limits are shown as a count and can turn the count into a warning; the Done column is bounded by the configured retention window. The board is the most spatial view, and the standard protects its rhythm: no fixed metadata tray, no floating badges, no column frames that turn lanes into nested boxes.

**List.** The list is for scanning and comparing. It is the strictest grid: a compact row height, a sticky header, single-line titles, truncation with ellipsis, and group sections that can carry status or priority so the rows do not repeat them. The list is also the shared row used by the Inbox queue and the board's Backlog list, so a user moving between surfaces does not have to relearn the anatomy. Filtering is consolidated into dedicated controls rather than duplicated segmented buttons, because duplicated controls create two sources of truth for the same state.

**Triage.** The attention view is for deciding what needs action now. It flattens each blocked issue into an `h-11` row, puts urgency at the front, keeps the row border neutral, and reveals triage actions on hover. The standard explicitly forbids wrapping a single triage item in a full-width, multi-line bordered block: the queue's value is the number of items visible and the speed of the next decision. The implementation adds a quiet leading stripe and a tinted urgency pill, which is the same idea expressed with the token system.

The three rhythms are different on purpose. Making the board as dense as the list would hide the spatial relationships that make a board useful; making the list as spacious as the board would defeat scanning; making triage look like either would slow down the queue. The design document's value is that it states these differences instead of letting each new view invent its own compromise.

## Keyboard-first interaction

The standard treats keyboard access as a first-class navigation mode, not an accessibility afterthought. The shared hotkey catalogue declares bindings without callbacks, so the app shell, hint components and tests all read the same definitions. Global bindings cover search (`Mod+K` and `/`), new issue (`C`), the sidebar (`Mod+B`) and settings (`Mod+,`); the board adds selecting or opening a focused card (`X`) and changing its status (`S`). The board also adds roving focus and arrow traversal: up and down within a lane, left and right between lanes, with the card opening on a separate action. Rows respond to `Enter` and `Space`.

Modifier-based hints appear while the relevant modifier is held, so the shortcuts are discoverable without permanently occupying space. Because bindings are defined once and can be customised through the hotkey provider, the hint text and the actual behaviour cannot drift apart. The full key map is documented in [Use the keyboard](../how-to/use/keyboard.md).

The keyboard-first stance shapes layout as much as behaviour. Focus states must be visible on quiet surfaces; rows must be focusable as rows, not as a chain of tiny controls; the board must have a roving tab stop rather than putting every card in the tab order. A design that only works with a mouse would fail the standard even if it looked correct.

## Drag states and target sizes

Drag and drop is the board's primary mutation gesture, so the standard treats its feedback as part of the interaction contract. The cursor changes to grabbing during a drag, the dragged card is visually lifted, and the drop location is shown as a thin insertion line rather than by violently reshuffling the lane. The implementation follows that intent with `active:cursor-grabbing` and an accent-coloured insertion bar where the card will land; the library animates the surrounding cards with a short flip instead of a jump.

The same section fixes a minimum 24×24px hit area for interactive metadata icons. That number is not cosmetic: priority, status and size controls are small visual targets by design, and a dense layout makes it tempting to make them smaller still. Reserving a larger invisible target keeps the visual density without making the controls frustrating to use, especially on touch devices.

These details matter because drag and keyboard are where a dense interface most easily becomes hostile. A misplaced drop or a tiny target turns a fast triage action into a correction. The standard spends its interaction budget on predictable feedback rather than on decorative motion.

## What the standards trade away

The design system is opinionated, and the opinions have costs. Rigid grids and truncation hide long titles and extra labels until a tooltip or the inspector. Subtle surfaces can make a low-contrast monitor feel washed out, and the dark-mode defaults are not a universal solution. Keyboard-first navigation assumes a user who will invest in learning the keys; the hints help, but they do not remove the learning curve. The three view rhythms mean a user must understand which view is for which job.

Those costs are accepted because the cockpit is used repeatedly by the same small team, not visited once by a stranger. Positional memory, low visual noise and fast keyboard actions compound over a working day. The standards are there to stop each new feature from trading those gains for a locally prettier screen. The result is not minimalism for its own sake; it is a deliberate allocation of attention to the work.

## Related

- [The design standards](../DESIGN.md) — the full token, view and interaction specification.
- [Use the keyboard](../how-to/use/keyboard.md) — the complete shortcut map and navigation model.
- [Architecture](./architecture.md) — the read path and event flow that keep these views current.
- [Sync and mirror](./sync-and-mirror.md) — why the cockpit can be briefly stale, and how it converges.
