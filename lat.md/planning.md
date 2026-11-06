# Planning and actuals

Planning records intent at week granularity; actuals are observed from workflow changes. Both sit beside the labels rather than replacing them.

## Plan items and weeks

A plan item commits one open, sized issue to one Monday week. The row in `state_plan_item` is keyed by `owner/name` plus issue number, so it survives mirror pruning and a full re-sync, and it is never written to GitHub.

[[src/lib/server/planning/store.ts#setPlanItem]] writes the commitment; [[src/lib/server/planning/store.ts#clearPlanItem]] removes it; [[src/lib/server/planning/store.ts#listPlanItems]] reads a week. Weeks are ISO Monday dates in UTC, handled by [[src/lib/server/planning/calendar.ts#weekStartOf]], [[src/lib/server/planning/calendar.ts#addWeeks]], and [[src/lib/server/planning/calendar.ts#isMondayISO]].

Scheduling happens on the issue's Properties panel, not on `/plan`. The `/plan` page is the team-level capacity projection; it can remove a commitment but does not create one.

## Estimates come from size

An issue's estimate is derived from its current size label and the configured size-to-minutes map.

[[src/lib/server/planning/capacity.ts#estimateMinutes]] resolves the mapping on every read; the defaults are `sm` 120, `md` 240, and `lg` 480. Changing a size or the mapping re-prices every plan item without touching rows, and an issue without a size cannot be scheduled.

## Capacity model

[[src/lib/server/planning/capacity.ts#distributeIssues]] splits each estimate across the active maintainers among an issue's assignees. The integer remainder goes to the first share so the total is exact. Work assigned only to inactive or unconfigured people lands in an unassigned bucket with no cap.

Each maintainer has net weekly minutes, meaning contracted hours minus recurring meetings, on-call, and other fixed commitments. Capacity for a window is:

```text
floor(weekly_minutes * weeks * allocation_percent / 100)
```

The default allocation is 60%, leaving the rest as buffer. [[src/lib/server/planning/plans.ts#planBuckets]] turns a distribution into lanes with committed, remaining, and over-cap state. [[src/lib/server/planning/plans.ts#weekPlan]] adds the open unestimated issues that still need an estimate.

Unsized commitments are kept visible in their owner's lane or the unassigned bucket but contribute no minutes. They never make a lane over cap and are not repeated in the general unestimated list when they already have a row on the page.

## Scheduling rules

[[src/lib/server/planning/mutations.ts#scheduleIssue]] re-derives everything from the mirror rather than trusting the client. It rejects, in order:

- a week that is not a Monday;
- an issue that is not mirrored, or is closed;
- an issue with no size estimate;
- an issue whose assignees include no active, configured maintainer;
- a target week where an affected maintainer's lane would exceed its cap.

The last case returns `409` with the violating lanes. Moving an issue writes only the new week, so its old week frees immediately. Re-scheduling to the same week is a no-op and skips the cap check.

The cap is hard only on plan mutations. A later GitHub edit, such as a new assignee or a larger size, can push a lane over; the plan then shows the over-cap state rather than silently rewriting intent. Unassigning an issue uses [[src/lib/server/planning/mutations.ts#unscheduleIssue]].

## Actual time is observed

Funnel records only the transitions it observes; it does not reconstruct history from GitHub timelines.

[[src/lib/server/actuals/transitions.ts#recordIssueTransitions]] compares the previous mirror snapshot with the new one and appends an event only when status, state, blocked, priority, labels, or assignees changed. The first sighting writes baseline rows, so tracking starts when Funnel first observes the issue.

Actual time is the union of intervals where the issue is open and its status is `in-progress` or `in-review`. In-review counts as active work. Closing ends the interval at the forge's `closedAt` when known, otherwise at the close event; reopening starts a new interval if the status is still active. [[src/lib/server/actuals/time.ts#activeIntervals]] implements the state machine, and [[src/lib/server/actuals/time.ts#computeIssueTime]] produces actual, delay, estimate, variance, lead, and cycle minutes.

There is no historical backfill. The data is complete from the moment Funnel began watching, which is honest about the deployment boundary and avoids mixing guesses into a number used by planning and reports.

## Delays are intervals

A delay is waiting time recorded in `state_issue_delay` with a structured reason, an optional note, and a source of `blocked` or `manual`. The reasons are `dependency`, `info`, `review`, `external`, `capacity`, and `other`, defined in [[src/lib/funnel-metadata.ts#DELAY_REASONS]].

Automatic delays follow the `blocked` flag. Adding the flag opens a delay whose reason comes from the issue body's `funnel_metadata`; removing it closes the automatic delay. Closing the issue closes every open delay, and reopening a still-blocked issue starts a new one. Manual delays are entered from the Inspector through [[src/lib/server/actuals/store.ts#createManualDelay]] and never touch GitHub.

The two sources may overlap, so total delay time is the union of intervals and a blocked dependency that also has a manual wait is counted once. Keeping delays as intervals preserves the reason and note and lets one issue carry several waits over its life.

## Epics are body metadata

An epic is an ordinary issue carrying the `epic` label; its children live in the issue body.

The mirror caches the label as `mirror_thread.is_epic`. [[src/lib/funnel-metadata.ts#readEpicChildren]] parses the `epic.children` list and [[src/lib/funnel-metadata.ts#writeEpicChildren]] replaces only that section.

The body is the source of truth because it is portable, visible on GitHub, and survives a mirror rebuild. [[src/lib/server/epics/mutations.ts#setEpicChildren]] validates refs, rejects self references and nested epics, rejects a child already claimed by another epic, and preserves every other metadata section. `listEpics` and `getEpicDetail` roll up child progress with the same estimate and actual-time calculators as the issue detail.

## Milestone timeline

The timeline is a read-only projection of open milestones, plan weeks, and observed status transitions.

[[src/lib/server/planning/timeline.ts#milestoneTimeline]] starts each bar at the earliest planned week for the milestone's issues or the first observed `in-progress`/`in-review` transition, and ends it at the due date. It invents no per-issue start or end date and does not clamp a plan week that landed after the due date; the UI flags that instead.

Undated milestones stay in a separate table rather than receiving an invented end. The projection batches its reads, so a wide milestone does not degrade into N+1 lookups.

## Days are not modeled

Planning stops at the week: Funnel does not allocate issues to hours or keep a daily schedule.

The removed day planner's four tables are retained so an upgrade does not destroy data, but no current code reads or writes them. New planning work belongs in `state_plan_item`.

## Tests

Capacity distribution, scheduling, and actual-time arithmetic are covered by [[src/lib/server/planning/capacity.test.ts]], [[src/lib/server/planning/plans.test.ts]], [[src/lib/server/planning/mutations.test.ts]], [[src/lib/server/actuals/time.test.ts]], and [[src/lib/server/actuals/transitions.test.ts]]; routes and the timeline by [[tests/planning-routes.test.ts]] and [[tests/timeline-page.test.ts]].

## Related

The workflow and attention docs cover the labels and exceptions that planning consumes.

- [[workflow]] — the labels and priority that planning consumes.
- [[sync]] — how assignees, sizes, and states reach the mirror.
- [[attention]] — how stale and waiting work is surfaced.
