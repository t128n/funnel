DESIGN.md: Linear-Inspired UI/UX Standards
This document establishes the design principles, structural rules, and component patterns required to deliver high-polish, high-density, keyboard-friendly interfaces. Follow these specifications directly during initial implementation to avoid layout regressions and refactoring.

1. Core Principles
   High Information Density Without Clutter: Density is achieved through strict tabular alignment, consistent row heights, and low visual noise—never by cramming multi-line blocks into small spaces.

Rigid Grids Over Variable Stacks: Data views (lists, tables, feeds) must align columns across rows. Elements must never shift dynamically based on content length.

Subtle Surfaces Over Heavy Outlines: Contrast is achieved via layered background tones and faint, translucent borders (rgba(255, 255, 255, 0.05–0.08)), not thick solid borders or colorful card shells.

Zero Visual Redundancy: Do not duplicate data. If a view or column header specifies a state (e.g., status, project), do not repeat that state icon or name inside every child card.

2. Global Token Specifications (Dark Mode)
   Elevation & Surfaces
   Canvas / Base Background: #0d0e11 or #111215

Card / Row Surface (Resting): #18191d

Card / Row Surface (Hover): #1e2025

Divider & Border (Resting): 1px solid rgba(255, 255, 255, 0.06)

Border (Interactive/Hover): 1px solid rgba(255, 255, 255, 0.14)

Active Focus Ring: outline: 1.5px solid #5e6ad2 (offset: 2px)

Typography
Font Family: Clean sans-serif (Inter, system UI font); monospace for IDs, sizing tokens, and dates.

Row/Card Titles: 13px or 14px, font-weight: 500, high contrast (#f3f4f6).

Identifiers & Secondary Meta: 11px or 12px, font-weight: 400, muted contrast (#9ca3af / rgba(255, 255, 255, 0.45)).

Badges & Pills: 10px or 11px, font-weight: 500 to 600, uppercase or capital case.

Priority & Urgency Tokens
Always use a fixed 16x16px container with a 1.5px minimum stroke. Inactive bars must remain visible in a muted tone to preserve the scale.

Urgent: Icon: Alert/Exclamation. Color: #f87171 (text-red-400, bg-red-500/10)

High (3 bars): Color: #fb923c (text-orange-400)

Medium (2 bars): Color: #facc15 (text-amber-400)

Low (1 bar): Color: #94a3b8 (text-slate-400)

None (0 bars): Color: rgba(255, 255, 255, 0.2) (faint dotted outline or empty container)

Size / Estimate Badges
Use monospace, uppercase text with translucent background fills:

XS / S: bg: rgba(56, 189, 248, 0.1), border: rgba(56, 189, 248, 0.25), text: #38bdf8

M: bg: rgba(251, 191, 36, 0.1), border: rgba(251, 191, 36, 0.25), text: #fbbf24

L / XL: bg: rgba(168, 85, 247, 0.1), border: rgba(168, 85, 247, 0.25), text: #c084fc

3. View Patterns & Guidelines
   A. Kanban Board View
   Card Anatomy
   Plaintext
   ┌──────────────────────────────────────────────┐
   │ FIT-2 │ <- 11-12px muted text (prefix + number)
   │ HTTP Route Intake Submission │ <- 13-14px primary text, max 2 lines
   │ │
   │ [Priority] [Size] [Labels...] [Avatar] │ <- 18px fixed-height metadata tray
   └──────────────────────────────────────────────┘
   Do
   Eliminate outer column frames and heavy column border boxes. Columns should be open vertical tracks with subtle headers.

Show the column + action button only when hovering over the column header.

Truncate long issue titles after 2 lines with text-overflow: ellipsis.

Anchor assignee avatars to the bottom-right via margin-left: auto.

Keep cards at a uniform minimum height so empty metadata does not collapse the card shape.

Don't (Anti-Patterns)
Never display status icons inside board cards. The column header already defines status.

Never display full repository paths (e.g., #2 funnel-issue-tracker). Always normalize to short project identifiers (e.g., FIT-2).

Never leave cards floating without fixed metadata trays. Floating single letters or loose badges disrupt vertical rhythm.

B. List View
Grid Layout
Do not rely on bare Flexbox with auto widths for list items. Implement a strict columnar CSS Grid per row:

CSS
.list-row {
display: grid;
grid-template-columns:
24px /* Status Icon _/
72px /_ Identifier (FIT-XXX) _/
minmax(200px, 1fr) /_ Title (truncated single line) _/
auto /_ Tags / Labels container _/
24px /_ Priority Target _/
32px /_ Estimate / Size _/
72px /_ Timestamp (Right-aligned) _/
24px; /_ Assignee Avatar */
align-items: center;
gap: 12px;
height: 40px;
padding: 0 12px;
border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
Do
Enforce single-line titles with white-space: nowrap; overflow: hidden; text-overflow: ellipsis;.

Render a subtle fallback placeholder (e.g., Untitled) if an issue lacks a title.

Provide an active hover state across the entire row surface (rgba(255, 255, 255, 0.03)).

Group list items by default (e.g., by status, priority, or milestone) using collapsible section headers.

Don't (Anti-Patterns)
Never let metadata float dynamically based on title length. Missing or short titles must never shift subsequent columns to the left.

Never duplicate segmented filter buttons (e.g., displaying All | Mine adjacent to Open | Closed | All). Keep filtering consolidated into clean, dedicated controls.

Never let label text overflow abruptly without proper truncation bounds or counter badges (e.g., avoid good first i...).

C. Attention / Triage View
Do
Flatten triage items into dense, single-row tracks (h-11 or h-12).

Anchor urgency indicators (e.g., Today, Overdue, in 2d) near the front of the row or inside a fixed metadata column.

Apply urgency colors strictly to text and badge surfaces (e.g., amber-400 text with 10% opacity fill), leaving row borders neutral.

Show triage action buttons on row hover (e.g., Snooze, Mark Done, Change Priority).

Keep sidebar notification counts strictly synchronized with items requiring immediate action (e.g., overdue and due today only).

Don't (Anti-Patterns)
Never wrap single triage items in full-width, multi-line bordered blocks.

Never paint full-width colored borders (e.g., solid yellow bounding boxes around "Due Today" cards).

Never duplicate issue titles or status metadata across multiple lines within the same triage entry.

4. Interaction & Micro-UX Standards
   Keyboard-First Navigation:

Global shortcut access (C = New issue, / = Search, X = Select row, Esc = Clear selection).

Arrow key traversal (↑ / ↓ between rows/cards; ← / → between Kanban columns).

Drag-and-Drop States:

Cursor must switch to grabbing during active drag.

Dragged cards must receive a subtle tilt (transform: rotate(2deg) scale(1.02)) and elevated drop shadow (box-shadow: 0 12px 28px rgba(0, 0, 0, 0.5)).

Show a discrete, 2px colored insertion line between cards rather than violently reshuffling columns during hover.

Target Sizes:

Interactive metadata icons (priority, status toggle, size) must have a minimum clickable hit-box of 24x24px with a subtle hover highlight.
