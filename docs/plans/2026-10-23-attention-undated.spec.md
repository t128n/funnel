# Spec — surface blocked issues without a re-check date

Source: GitHub issue #24.

## 1. Problem

`attentionIssues()` only returns open, blocked issues whose body metadata carries a
valid `YYYY-MM-DD` re-check date. A blocked issue without a date (or with malformed
metadata) is silently absent from Attention and the sidebar badge, so blocked work
can disappear from the one view meant to surface it.

## 2. Required behaviour

1. Every open, blocked issue appears in Attention, whether or not it has a usable
   re-check date.
2. A valid date still lands in `overdue`, `today`, or `upcoming` (next 7 days).
   Valid dates beyond +7 days stay out of the view, as today.
3. A missing, empty, malformed, or calendar-invalid date (for example
   `2026-02-30`) lands in a new `unscheduled` bucket, rendered as a **No re-check
   date** group after Upcoming.
4. The unscheduled group has a neutral tone and a row pill that offers to set a
   date; it never renders `NaN` or an invalid date as text.
5. `actionableCount()` and the sidebar Attention badge still count only overdue +
   due today. Unscheduled items never increase the badge. This is documented.
6. Setting a date through the existing block/reschedule flow moves the item into
   a dated bucket on the next reload. Read-only users are unchanged.

## 3. Fixed decisions

- `AttentionItem.recheck` stays a `string`; `""` means missing or malformed.
- `AttentionBuckets<T>` gains `unscheduled: T[]`; no other bucket changes.
- `attentionIssues()` returns all open blocked issues and normalises unusable
  dates (including calendar-invalid shapes) to `""`.
- Undated items sort after dated items; ties are ordered by issue number ascending.
  Equal dated re-checks also fall back to issue number.
- No new route, API, table, or label. The `blocked` flag and body metadata stay
  the source of truth.

## 4. Acceptance

- A blocked issue with no re-check date returns from `attentionIssues()` and is
  visible on `/attention`.
- An issue blocked with malformed metadata is normalised to `""` and visible.
- Non-blocked issues with a date in their body stay out of Attention.
- Dated ordering and the seven-day window are unchanged.
- The sidebar badge does not count unscheduled items.
- `bun test` and `bun run check` pass.

## 5. Docs

- `docs/explanation/workflow-model.md`, `docs/tutorials/getting-started.md`, and
  `docs/tutorials/triage-a-backlog.md` describe the new group.
- `docs/how-to/configure/board.md` states the badge rule (overdue + due today
  only; unscheduled items are listed but not counted).
