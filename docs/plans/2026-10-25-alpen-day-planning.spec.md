# ALPEN day planning, working hours and calendar feed — spec

Companion to `2026-10-25-alpen-day-planning.md`.

## 1. Clock and availability

ALPEN is a day view over the existing week plan, not a second backlog. A viewer's day is one local calendar date in their IANA timezone. Stored instants are unix milliseconds; day blocks are local minutes from midnight (`0..1440`).

- **A**ufgaben — candidates from the Monday week containing the date: open, sized issues that are assigned to the viewer or unassigned, ordered P1 → P2 → P3 → unprioritized, then issue number.
- **L**änge — each block's minutes, seeded from `planning.size_minutes`.
- **P**uffer — a configurable share of the work window, emitted as explicit `buffer` blocks. Auto-plan spends at most `available − buffer`.
- **E**ntscheiden — ordering plus manual add, remove and start-time edits.
- **N**achkontrolle — planned vs actual minutes per issue, actuals clipped from `state_issue_event` to the viewer's local day.

Working hours are per viewer with admin defaults in `planning.work_defaults`: timezone, `start_minute`, `end_minute`, `work_days` (ISO 1–7) and `buffer_percent` (`0..90`). Absent per-viewer row → admin defaults. Unavailable windows are recurring (`weekday`) or one-off (`date`), each with a label and `0 <= start < end <= 1440`; they subtract from the work window.

DST policy: a wall time inside a spring-forward gap shifts forward by the gap length (02:30 → 03:30); an ambiguous fall-back time resolves to the earlier instant. A cap of 60 chars applies to window labels.

## 2. Day model

`validateDayBlocks` sorts by start, rejects overlaps (`Blocks overlap at HH:MM`), `minutes < 5`, `start + minutes > 1440`, more than 40 blocks, an `issue` block without a ref, and a `buffer` block with a ref. It does not reject blocks outside the work window: manual plans may overrun, and the UI flags it. Only auto-plan enforces hours and buffer.

`autoDayPlan` fills the available ranges chronologically in candidate order, splitting an issue across ranges but never leaving a fragment under 15 minutes, placing each candidate at most once. Leftover space ≥ 15 minutes per range becomes a `buffer` block; smaller leftovers extend the previous block. A non-work day yields no blocks.

`dayReview` sums issue blocks per ref (`plannedMinutes`) against the caller's clipped actuals, returns per-row `varianceMinutes = actual − planned`, and excludes buffer blocks.

## 3. Persistence

Four durable tables, all keyed by `auth_user.id` with `ON DELETE CASCADE`, snake_case, no FK to `mirror_*`:

- `state_work_hours` — `user_id` PK, `timezone`, `start_minute`, `end_minute`, `work_days` (JSON array), `buffer_percent`, `created_at`, `updated_at`.
- `state_unavailable_window` — `id` PK, `user_id`, `label`, `weekday` nullable, `date` nullable, `start_minute`, `end_minute`, `created_at`, `updated_at`; exactly one of `weekday`/`date` is set.
- `state_day_block` — `id` PK, `user_id`, `date`, `start_minute`, `minutes`, `kind` (`issue` | `buffer`), `org`, `name`, `issue_number` (all nullable, set only for `issue`), `created_at`, `updated_at`; index `(user_id, date)`.
- `state_calendar_feed` — `user_id` PK, `token_hash` unique, `token_hint`, `created_at`.

The feed token is 32 random bytes, base64url (43 chars). Only the SHA-256 hex hash and the first 8 characters are stored; the token is returned once and rotating it invalidates the previous one. Lookup strips a trailing `.ics`.

## 4. Settings

`planning.work_defaults` defaults to `{ "timezone": "UTC", "start_minute": 540, "end_minute": 1020, "work_days": [1,2,3,4,5], "buffer_percent": 20 }` and is validated like the per-viewer row. It is the fallback for every viewer without a row and the prefill for `/settings/availability`.

## 5. Self-service API

All `/api/me/*` routes require a session only (`apiSession`), never `write`, and touch only the caller's rows.

- `PUT /api/me/availability` — body `{ timezone, start_minute, end_minute, work_days, buffer_percent, windows: [{ label, weekday, date, start_minute, end_minute }] }`; replaces hours and windows in one transaction; `204`.
- `POST /api/me/calendar-feed` — creates or rotates; returns `{ token, url, hint, createdAt }`, where `url` is `<origin>/api/calendar/<token>.ics`.
- `DELETE /api/me/calendar-feed` — idempotent `204`.
- `PUT /api/me/day-plan` — body `{ date, blocks }`; validates and replaces that day; returns `{ blocks }`.
- `POST /api/me/day-plan/auto` — body `{ date }`; builds, persists and returns `{ blocks }`.

Resolution order for hours: stored row, then `planning.work_defaults`. Issue blocks are checked against the mirror; unmirrored or closed issues are rejected with `400`.

## 6. ICS feed

`GET /api/calendar/{token}.ics` is public (no session) and read-only. Unknown or rotated tokens return `404`. Headers: `Content-Type: text/calendar; charset=utf-8`, `Content-Disposition: inline; filename="funnel.ics"`, `Cache-Control: private, max-age=300`, `X-Robots-Tag: noindex, nofollow`.

RFC 5545: CRLF line endings, 75-octet folding on character boundaries, escaping of `\ ; ,` and newlines, `DTSTART`/`DTEND` in UTC. Feed window: today − 7 days through today + 42 days in the viewer's timezone. Events: one per issue block (`SUMMARY` = `FUNNEL-12 Title`, description = issue URL), one per buffer block (`Buffer`), one per unavailable window (its label). All are `TRANSP:OPAQUE`. `UID` is `<table>-<id>@funnel`; `DTSTAMP` comes from `now`.

## 7. Day horizon

`/plan?horizon=day&day=YYYY-MM-DD` adds a fourth horizon next to week, cycle and milestone. A malformed date falls back to the viewer's local today; previous/next shift by one day. `dayView(userId, date)` returns:

```ts
interface DayView {
  date: string;              // YYYY-MM-DD, the viewer's local day
  label: string;             // e.g. "Sun 25 Oct 2026"
  weekday: number;           // ISO 1..7
  workHours: WorkHours;      // effective hours (stored row or admin defaults)
  startMinute: number;       // effective work window
  endMinute: number;
  windows: DayWindow[];      // unavailable windows for this date
  blocks: DayBlock[];        // saved blocks for this date, ascending
  available: MinuteRange[];  // work window minus windows
  availableMinutes: number;
  bufferMinutes: number;     // reserved share of availableMinutes
  plannedMinutes: number;    // issue blocks only
  bufferPlannedMinutes: number;
  candidates: DayCandidate[]; // ordered P1 -> P3
  review: DayReview;
  feedEnabled: boolean;      // a calendar token exists
}
```

## 8. Availability page

`/settings/availability` is a personal section (`read` and above). It shows hours, unavailable windows and the calendar feed: create link (show once with copy), regenerate, revoke. It posts to the `/api/me/*` routes; the secret is never rendered from the page load. Add it to `PERSONAL_PATHS` and to the personal group of `settingsGroups`.

## 9. Day UI

`/plan` gains a Day tab rendering `DayPlan`: hour grid, blocks, candidate list, five ALPEN chips (count, planned minutes, buffer, ordering, review variance), actions for auto-plan, clear day, add candidate, remove block, and a link to `/settings/availability`. Editing a start time resaves the whole day.

## 10. Documentation

New how-to `docs/how-to/plan/plan-your-day.md` (Outlook subscribe, regenerate/revoke, manual overrun, DST), plus updates to settings, database-schema, routes-and-pages, http-api, glossary, workflow-model, the planning how-to and the docs index. A `tests/docs-alpen.test.ts` guards the names.

