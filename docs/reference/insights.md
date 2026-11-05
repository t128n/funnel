# Insights

`/insights` is a read-only triage dashboard. It answers seven questions over the
mirrored issue data and the append-only triage log:

| Question | Metric | Clock |
| :--- | :--- | :--- |
| How old is the inbox? | Inbox age | Snapshot |
| How long until the first triage decision? | Time to first triage | Range |
| How long until an issue closes? | Time to close | Range |
| What throughput do we have? | Daily decisions and closes | Range |
| How much work is in progress? | WIP | Snapshot |
| What is stale? | Stale waiting issues | Snapshot |
| How old is the backlog? | Backlog aging | Snapshot |

The formulas live in `src/lib/server/insights/metrics.ts` and are deliberately
free of database access, so they can be unit-tested directly. The SQL loader in
`src/lib/server/insights/load.ts` only gathers the rows those formulas need.
Nothing on this page writes to SQLite or to GitHub.

## Date range

The URL carries `?from=YYYY-MM-DD&to=YYYY-MM-DD`. Both endpoints are UTC
calendar dates. The range is half-open in instants:

```text
[ fromT00:00:00Z , (to + 1 day)T00:00:00Z )
```

Both boundary days are included, which makes `from=2026-11-01&to=2026-11-01` a
single UTC day.

- With neither parameter, the default is the last 30 calendar days including
  today (today is the `to` boundary).
- A missing endpoint takes its default boundary, so `?from=2026-10-01` runs
  through today.
- A malformed or reversed pair (`from > to`) is replaced by the full default
  range. The page shows the effective range and a warning instead of failing.
  The payload reports `range.fallback: true` and the raw `range.requested`
  values.
- The date range is UTC. There is no business-day, working-hours or DST
  adjustment for range metrics. A decision at `23:59` UTC belongs to that UTC
  day even if the viewer's local date is different. (The stale-waiting
  snapshot deliberately reuses #32's local-calendar rule; see below.)

## Repository filter

`?repo=owner/name` narrows every query that can carry a repository scope. The
picker lists configured repositories plus **All repos**. A repository that is
not configured yields empty metrics (zero counts, null medians) rather than an
error.

Two metrics are intentionally broader:

- **Inbox age** counts staged submissions. A submission has no repository until
  it is accepted, so it remains visible under a repository filter. Accepted and
  duplicated decisions carry a repo slug and are filtered normally; dismissals
  have no repo and therefore drop out of repo-filtered decisions.
- **Stale waiting** joins a waiting row to its open mirrored issue, so a waiting
  row whose issue was pruned or closed is not counted.

## Snapshot metrics

Snapshot metrics use one clock (`generatedAt`, effectively now) and do not care
about the selected range. They are labelled **now** on the page.

### Inbox age

Pending intake submissions are rows in `state_intake_submission` with
`archived_at IS NULL` that are **not currently snoozed**. Each age is:

```text
max(0, now - created_at)
```

The dashboard reports the number of pending submissions, the median age, the
p90 age, and the oldest age in whole days (`floor(oldest / 1 day)`). Archived
submissions are excluded even if they were later restored: restoration clears
`archived_at`, so a restored row is pending again.

### WIP

Open mirrored issues (`mirror_thread.state = 'open'`, `kind = 'issue'`) whose
status is exactly `in-progress` or `in-review`. The card shows the total and the
two status counts. A missing status is not WIP.

### Stale waiting

Open issues with a `state_issue_waiting` row whose waiting age passes the
shared `#32` stale rule: **more than 7 local calendar days**. Exactly seven days
is not stale; the next calendar day is. This reuses `isWaitingStale` from
`src/lib/waiting.ts` so Attention and Insights cannot drift. Closed or pruned
issues are not counted.

### Backlog aging

Open mirrored issues whose status is `backlog`, `todo`, or unset
(`NULL`/empty). Age is whole days since `created_at`:

```text
age = floor(max(0, now - created_at) / 1 day)
```

| Bucket | Ages |
| :--- | :--- |
| `0-7` | 0 through 7 days |
| `8-30` | 8 through 30 days |
| `31-90` | 31 through 90 days |
| `91+` | 91 days and older |

The bucket edges are inclusive on the upper bound. Issues with a missing or
invalid `created_at` are skipped. The card reports each bucket count and the
total of the four buckets.

## Range metrics

Range metrics include only events whose timestamp lies in the UTC range above.
They are labelled **range** on the page.

### Time to first triage

For each submission, find the **earliest** triage event whose action is
`accepted`, `dismissed`, or `duplicated`. An `undone` event is ignored for this
selection; it does not become a triage decision and an `undone`-only history has
no sample. Then:

```text
duration = max(0, first_decision.created_at - submission.created_at)
```

Only samples whose *first* decision falls inside the range are included. A
submission triaged before the window and touched by another event inside the
window is not counted. A decision whose submission row is missing is skipped.
Under a repository filter, the **first** decision must also name that repo:
a submission dismissed without a repo is not counted even if it is later
accepted into the selected repo. The card reports the sample count, median and
p90.

### Time to close

Mirrored issues (`kind = 'issue'`) with a `closed_at` inside the range and a
valid positive `created_at`:

```text
duration = max(0, closed_at - created_at)
```

Missing or invalid timestamps are skipped. The sample count is the number of
issues that closed in the range, not the number of open issues.

### Throughput

A daily series over every UTC day in the range, including days with no activity
(zero-filled):

- **Decisions**: `accepted`, `dismissed`, and `duplicated` events per day.
  `undone` is excluded.
- **Issues closed**: mirrored issues whose `closed_at` falls on that UTC day.

Both series are raw counts, not rates. The card also reports the total
decisions and total issues closed in the range. The chart is plain CSS bars; it
uses no charting dependency.

## Percentiles

Median and p90 use linear interpolation between the closest ranks over the
sorted samples (the same convention as `PERCENTILE.INC`). With `n` samples and
percentile `p` in `0..1`:

```text
position = (n - 1) * p
value = sorted[floor(position)]
      + (sorted[ceil(position)] - sorted[floor(position)])
        * (position - floor(position))
```

Consequences:

- No samples: `null`, never `NaN` or `0`.
- One sample: the median and p90 are that sample.
- Even samples: the median is the average of the two middle values.
- Odd samples: the median is the middle value.

## Empty and partial data

Empty is a valid result, not an error. With no submissions, no decisions in the
range, no closed issues, an empty mirror, an unknown repository, or missing
timestamps:

- every count is `0`;
- every median and p90 is `null` (rendered as an em dash);
- the throughput series still contains every day in the range, all zero;
- the backlog contains its four buckets, all zero;
- the selected effective date range is still reported.

## Related

- [Database schema](database-schema.md) — `state_intake_submission`,
  `state_triage_event`, `state_issue_waiting`, `mirror_thread`, `mirror_repo`.
- [Routes and pages](routes-and-pages.md) — the `/insights` route entry.
- [Intake lifecycle](../explanation/intake-lifecycle.md) — staging, accepting,
  dismissing, duplicating and undo.
- [Planning and time](planning-and-time.md) — the separate actual-time and
  delay intervals used by the Inspector.
