# Attention rules

Attention rules turn four triage thresholds into explicit breaches. Admins set the thresholds under **Settings → Attention rules**; breaches appear in a **Rule breaches** section on `/attention`, and each assignee with a linked Funnel account receives one `sla` notification per rule, issue and UTC day. Rules are instance-wide: there are **no per-repository overrides**.

Set any rule's value to `0` to disable it. A disabled rule contributes no breaches and no notifications. The other three rules keep running.

## Thresholds and defaults

| Rule | Setting key | Default | Unit | Disabled by |
| :--- | :--- | ---: | :--- | :--- |
| First response | `attention.first_response_days` | `3` | Elapsed 24-hour periods since `created_at` | `0` |
| Stale open | `attention.stale_open_days` | `30` | Elapsed 24-hour periods since `updated_at` | `0` |
| Re-check | `attention.recheck_cadence_days` | `7` | UTC calendar days past the body's re-check date | `0` |
| Waiting | `attention.waiting_days` | `7` | Local calendar days since the waiting row began | `0` |

Defaults preserve Funnel's pre-rule behaviour: the waiting threshold matches the original seven-day Attention/Insights rule, and the new first-response, stale-open and re-check rules start at their documented values. A value must be a non-negative integer.

Only **open, still-mirrored** issues are considered. Closed issues and issues pruned from the mirror never breach. A waiting row whose issue is closed or no longer mirrored is ignored even though the local row survives pruning.

## First response

**Formula:** an open issue breaches when `now - created_at >= first_response_days * 24h` and no comment exists whose author is someone other than the issue author.

- No comments at all → breach.
- Only comments by the issue author → breach.
- Any comment by another person → no breach.
- A comment with a null author counts as a response, because Funnel cannot prove it was written by the author.
- If the issue itself has a null author, any comment counts as a response.
- The boundary is inclusive: exactly three days old breaches, one millisecond younger does not.
- `daysOverdue` is the whole number of elapsed days minus the threshold, so exactly at the boundary it is `0`.

## Stale open

**Formula:** an open issue breaches when `now - updated_at >= stale_open_days * 24h`.

The comparison uses instants, not local dates, so timezone and DST never move the boundary. `daysOverdue` is the whole elapsed days minus the threshold; exactly at the boundary it is `0`.

## Re-check

**Formula:** a blocked open issue breaches when its body `funnel_metadata` envelope contains a valid `recheck` date and that date is **more than** `recheck_cadence_days` calendar days before the server's UTC `YYYY-MM-DD`.

- The date must be a real `YYYY-MM-DD` calendar date. Missing, malformed and impossible dates (for example `2026-02-30`) never breach.
- A valid date on an issue that is not flagged blocked never breaches.
- The boundary is strict: at exactly the threshold the rule is quiet; one day past it breaches.
- `daysOverdue` is the calendar days past the date minus the threshold and is at least `1`.

**UTC vs local:** rule evaluation uses the server's UTC date. The existing blocked groups on `/attention` (overdue, today, upcoming) still use the browser's local timezone. The two can differ by one day around midnight; the page labels the rule section with this caveat. There are no business-day or working-hours adjustments.

## Waiting

**Formula:** an open issue breaches when it has a `state_issue_waiting` row and the wait is older than `waiting_days` **local calendar days**.

- The comparison reuses the #32 `isWaitingStale` helper with the configured threshold. Exactly seven days is not stale by default; the next local day is.
- `daysOverdue` is the whole waited days minus the threshold and is at least `1`.
- `/attention`'s Waiting section uses the same configured threshold, so its stale badge and the rule agree.
- Insights' stale-waiting metric also uses `attention.waiting_days`; its default remains `7` for callers that do not pass a threshold.

## Notifications

The sync scheduler evaluates rules independently of page reads, at most once every five minutes. A pass is skipped entirely while `notifications.enabled` is `false`; existing notification rows are untouched.

For each breach, Funnel resolves every assignee to a linked Funnel user through the mirrored GitHub identity. Assignees without a linked account are skipped, and an issue with no resolved assignee produces no notification.

- **Kind:** `sla`, labelled **Attention rule** in the notification center.
- **Title:** the rule label and issue reference, such as `First response: owner/name#7`.
- **Body:** the breach summary shown in Attention.
- **Link:** `/issues/owner/name/7`.
- **Dedupe key:** `sla:<rule>:<repo>#<number>:<userId>:<UTC date>`.

A breach that persists across days may notify again the next UTC day; the dedupe key prevents a second notice for the same rule, issue, user and day. A breach that clears and returns later also notifies again once the day is new.

## Related

- [Settings](./settings.md)
- [Routes and pages](./routes-and-pages.md)
- [Insights](./insights.md)
