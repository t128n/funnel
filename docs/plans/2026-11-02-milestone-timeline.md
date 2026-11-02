# Milestone timeline — a read-only projection, not a schedule

**Goal:** add a dense, read-only timeline of open milestones whose bars are derived from facts Funnel already holds, so a triager can answer "will we hit this date?" without introducing per-issue start/end dates or a second schedule.
**Architecture:** a server projection (`milestoneTimeline`) folds `mirror_milestone`, `state_plan_item` and `state_issue_event` into rows; `svelte-echarts` renders an Apache ECharts Gantt beside an HTML milestone column that keeps the rows accessible and aligned. No writes, no new tables, no API, no schema change.
**Tech stack:** Bun 1.4.3, Svelte 5, SvelteKit 3, TypeScript 6, Drizzle + bun:sqlite, Tailwind 4, Apache ECharts 5 through `svelte-echarts`.
**Detail:** implementation
**Target-min:** 25
**Orchestrator:** staff architect

## Global constraints

- **Read-only.** No drag, no resize, no date picker, no API route, no migration, no new table. A `read` viewer sees exactly what a `write` viewer sees.
- **No new per-issue dates.** The only time inputs are:
  1. `mirror_milestone.due_on` (Unix ms, already mirrored),
  2. `state_plan_item.week_start` (Monday `YYYY-MM-DD`, Funnel-owned intent),
  3. the earliest `state_issue_event` row with `kind = 'status'` and `to_value` in `('in-progress', 'in-review')` (observed transition).
- **Honest absence.** A milestone with no due date goes in `undated`; it never gets a bar or an invented end. A milestone with no start signal keeps its due date row but renders a due marker and a `no start` flag instead of a bar. A plan week after the due date is surfaced as `after due`, not silently clamped.
- **Repo-scoped identity.** Milestones are `(repo, number)`; equal titles in two repos are separate rows.
- **Open milestones only.** Closed milestones are history and stay off this view. `listMilestoneIssues` already returns open issues attached to open milestones.
- **UTC calendar days.** Plan weeks and event instants are projected onto UTC days, matching `planning/calendar.ts`. The browser's local timezone never moves a bar.
- **Design language.** Funnel's t128n profile (`docs/DESIGN.md` §8) and the `t128n-design` skill: 1px `border-subtle` rules, no gradients, no shadows on content, `--radius-sm` on controls. Chart series use `chart-1` through `chart-3` (maximum six series, each labelled); planned fills stay at or below 20% opacity; status is icon + word in the HTML labels, never colour alone. Type is Geist Sans with Geist Mono only for refs and identifiers.
- **No filesystem overlap between workstreams.** Each agent owns the files listed under its task.

## Shared contract

`src/lib/timeline.ts` is the contract, already written:

```ts
type TimelineStartSource = "plan" | "active";

interface TimelineMarker {
  repo: string; number: number; title: string;
  status: string | null; priority: "P1" | "P2" | "P3" | null;
  blocked: boolean; at: number; source: TimelineStartSource;
}

interface TimelineRow {
  repo: string; number: number; title: string;
  dueOn: number | null; startOn: number | null;
  startSource: TimelineStartSource | null;
  openIssues: number; closedIssues: number; progress: number;
  markers: TimelineMarker[];
}

interface TimelineWindow { start: number; end: number; }

interface MilestoneTimeline {
  rows: TimelineRow[]; undated: TimelineRow[];
  window: TimelineWindow | null; now: number; repos: string[];
}

function milestonePath(repo: string, number: number): string;
```

## Server projection

New file: `src/lib/server/planning/timeline.ts`.

```ts
export interface TimelineFilter { repo?: string; }

export function milestoneTimeline(
  now: Date | number = Date.now(),
  filter: TimelineFilter = {},
): MilestoneTimeline;
```

Algorithm:

1. `nowMs = typeof now === "number" ? now : now.getTime()`.
2. Read `listMilestones()`; keep `state === "open"`. Apply `filter.repo` when set. Build `repos` from the **unfiltered** open set so the page's repo picker stays stable while filtered.
3. Read `listMilestoneIssues()` once; group the open issues by `${repo}\u0000${milestone.number}`.
4. Batch-read the earliest active event per issue from `state_issue_event`:
   - `where kind = 'status' and to_value in ('in-progress', 'in-review')`
   - `group by org, name, issue_number`
   - `min(at)`.
   Do not run one query per issue.
5. For each issue, `anchor = min(planWeekMs, activeEventMs)` when either exists. `source` is `"plan"` when the plan week is the earlier (or the only) signal, otherwise `"active"`. `planWeekMs` is `Date.UTC(y, m - 1, d)` for the Monday.
6. For each milestone:
   - `markers` = one marker per open issue with an anchor, sorted by `at` then `number`.
   - `startOn` = earliest marker `at`; `startSource` = that marker's source; `null` when there are no markers.
   - `openIssues`, `closedIssues`, `progress` come from `MilestoneItem` (progress is already `closed / total`, `0` for empty).
   - `dueOn` comes from `MilestoneItem`.
7. `rows` = milestones with `dueOn !== null`, sorted by `dueOn` ascending, then `repo`, then `number`.
   `undated` = milestones with `dueOn === null`, sorted by `repo`, then `number`.
8. `window` = `timelineWindow(rows, nowMs)`; `null` when `rows` is empty.
9. Return `{ rows, undated, window, now: nowMs, repos }`.

Window rules (pure, exportable for tests):

```ts
export function timelineWindow(
  rows: readonly Pick<TimelineRow, "startOn" | "dueOn">[],
  now: number,
): TimelineWindow | null;
```

- No rows with a due date → `null`.
- `lo = min(now, every startOn ?? dueOn)`, `hi = max(now, every dueOn)`.
- Pad each side by 7 days, then snap `start` down to the Monday 00:00 UTC and `end` up to the next Monday 00:00 UTC (exclusive).
- Enforce a minimum span of 8 weeks by extending `end`.
- Round using UTC arithmetic (`Date.UTC`), never local `setDate`.

Performance: the projection is one `listMilestones` query, one `listMilestoneIssues` query and one grouped event query. No N+1.

Tests (`src/lib/server/planning/timeline.test.ts`):

- plan-only start → `startSource: "plan"`, start is the Monday 00:00 UTC.
- active-only start → `startSource: "active"`, start is the event instant.
- both → the earlier one wins and its source is reported.
- no anchor → `startOn: null`, row still present, no markers.
- no due date → `undated`, not `rows`; `window` ignores it.
- progress comes from `closedIssues` / total, including a milestone with zero issues.
- markers exclude closed issues (seed a closed child).
- markers sorted by `at`, then `number`.
- rows sorted by due date; `undated` sorted by repo/number.
- `repo` filter narrows rows but `repos` still lists every open-milestone repo.
- window is Monday-aligned, includes `now`, pads one week each side, and spans at least 8 weeks.
- a plan week after the due date is preserved (no clamping).

Use `#tests/planning-helpers` (`resetPlanning`, `seedPlanningRepo`, `seedMilestones`, `planningMilestone`, `seedPlanningIssue`, `seedPlanningEvent`, `setPlanItem`). `resetPlanning` does **not** clear `state_issue_event`; the test file must `db.delete(stateIssueEvent).run()` in `beforeEach`.

## ECharts setup

Add `echarts@5` and `svelte-echarts@1` as runtime dependencies. Register only
what the chart uses so the route stays code-split:

```ts
use([CustomChart, ScatterChart, GridComponent, TooltipComponent, AriaComponent, CanvasRenderer]);
```

New files:

- `src/lib/components/timeline/timeline-options.ts` — pure `buildTimelineOptions` that turns rows, window, measured row metrics and the active t128n tokens into an `EChartsOption`.
- `src/lib/components/timeline/timeline-format.ts` — UTC date labels for the rows and tooltip, local month labels for the ECharts axis, progress/ref/escape helpers.
- `src/lib/components/timeline/timeline-options.test.ts` and `timeline-format.test.ts` — pure contract tests.

The option has at most six labelled series:

1. **Today** — a custom series that draws a 1px `border-strong` vertical line at `now`.
2. **Planned window** — a custom rect from `startOn` to `dueOn`: `chart-1` fill at 18% opacity with a 1px `chart-1` stroke.
3. **Closed work** — a custom rect from `startOn` to `startOn + duration × progress`: solid `chart-2`.
4. **Open issues** — a scatter of 1px × `--size-timeline-marker` `chart-3` ticks at each open child's anchor.
5. **Due, no start** — a neutral `text-muted` tick at the due date.
6. **After due** — a `color-warning` tick at the due date; the HTML row also says **After due** with an icon.

The x-axis is `time` at the top, bounded by the projection window, with
`customValues`-free month labels (local month names, because ECharts places
time ticks on local boundaries) and `border-subtle` split lines. The y-axis is a
hidden category axis with `inverse: true`; its split lines provide the row
rules. The tooltip is item-triggered, confined, token-coloured, and escapes
user titles. Animation is 180ms and disabled under
`prefers-reduced-motion`.

## Chart UI

New file: `src/lib/components/timeline/TimelineChart.svelte`.

Props:

```ts
interface Props {
  rows: TimelineRow[];
  /** `null` suppresses only the chart; the undated table still renders. */
  window: TimelineWindow | null;
  now: number;
  /** Open milestones without a due date; defaults to `rows` with a null due. */
  undated?: TimelineRow[];
  repoShortcodes?: Record<string, string>;
}
```

The component owns all three mutually exclusive states: the chart when
`window !== null` and dated rows exist, the undated table whenever `undated`
rows exist, and the empty state when both are empty. The page never duplicates
the undated table.

Layout:

- A horizontal scroll container (`overflow-x: auto`) with a token-sized
  minimum (`--layout-timeline-min`).
- A sticky HTML label column (`--layout-timeline-label`) and a fluid ECharts
  column (`--layout-timeline-chart-min`).
- The label header and the ECharts x-axis share one measured height; every
  label row and every canvas band share one measured row height. A
  `ResizeObserver` keeps them in step when the user changes text size or the
  container width.
- Each row is a real `<a>` to `/milestones/{owner}/{repo}/{number}` with the
  title at `text-body`/600, then one metadata line at `text-caption`:
  mono ref, due date, `closed/total closed`. One status appears when relevant:
  **Overdue** (`text-error` + icon), **After due** (`text-warning` + icon), or
  **No start** (`text-fg-muted` + icon).
- The HTML legend names **Planned window**, **Closed work**, **Open issues**,
  **No start** and **Today**; **After due** appears only when a row needs it.
  The legend is not drawn in the canvas.
- The undated table uses the shared `data-table` primitive: Milestone,
  Repository, Progress, Start, Due (`No due date`). It is the only rendering
  path for absent end dates.
- Empty state: `EmptyState` with **Nothing to plot yet.**, a short direction,
  and a **View Milestones** action.
- No interactive editing, no drag handlers, no date pickers.

`docs/DESIGN.md` §8 rules to follow: `text-caption` is 0.75rem, `text-body` is
0.875rem; mono only for refs; 1px `border-subtle` rules; `chart-1`–`chart-3`
for series; 18% planned fill; status icon + word; no raw hex in component CSS.

UI tests (`timeline-ui.test.ts`, source-read style): the ECharts imports and
registration, the real label links, the legend labels, the single undated table,
t128n token consumption, no literal hex and no drag handlers.

## Route, navigation and page

New files:

- `src/routes/(app)/timeline/+page.server.ts`
- `src/routes/(app)/timeline/+page.svelte`

Load:

```ts
export const load: PageServerLoad = async ({ url }) => {
  const repo = url.searchParams.get("repo")?.trim() || undefined;
  const all = milestoneTimeline(Date.now());
  const timeline = repo === undefined ? all : milestoneTimeline(Date.now(), { repo });
  return { timeline, repos: all.repos, repo: repo ?? null };
};
```

The `(app)` layout already enforces the session; do not call `requireUser` twice.

Page:

- `PageHead` title `Timeline`, description `Open milestones projected from plan weeks and observed status changes to their due dates.`
- A t128n `PageHeader` with the title, a live `N open` count, the one-line chart explanation, and a right-aligned **Milestones** outline button.
- A `Toolbar` with one native repository `<select>` (`All repositories` plus `all.repos`) styled as a 1px `border-strong` control. On change, navigate to `/timeline` or `/timeline?repo=...` with `goto(..., { reset: false })`.
- Render `<TimelineChart>` unconditionally with `rows`, `window`, `now`, `undated` and `repoShortcodes`; the component owns the chart, undated table and empty branches. The page never duplicates the undated table.

Navigation:

- `src/lib/components/shell/SidebarNav.svelte`: add `{ href: "/timeline", label: "Timeline", active: path.startsWith("/timeline"), icon: ChartGanttIcon }` to `workspace`, after Milestones.
- `src/routes/(app)/milestones/+page.svelte`: add a right-aligned **Timeline** outline button with `ChartGanttIcon` to the `PageHeader` actions.
- No footer nav exists in the t128n shell; the sidebar and app bar are the navigation.
- No change to `src/lib/issue-url.ts`; the timeline is not a detail-pane view.

Route tests (`tests/timeline-page.test.ts`):

- `load` returns a timeline with `rows`, `undated`, `window`, `now`, `repos`.
- `?repo=owner/name` narrows rows while `repos` still lists the unfiltered set.
- an unknown repo yields empty rows and still returns a stable `repos` list.
- the page source imports `TimelineChart`, `PageHeader` and `Toolbar`;
- the sidebar contains the `Timeline` item with `ChartGanttIcon`;
- the milestones page links to `/timeline`.

## Docs

- `docs/how-to/use/milestones.md`: add `## Read the timeline` explaining `/timeline`, the start sources, progress fill, markers, undated table, and that it is read-only.
- `docs/reference/routes-and-pages.md`: add a `/timeline` row to both the detailed cockpit table and the quick route map.
- `docs/explanation/planning-and-actuals.md`: add a short section `## The timeline is a projection` — why there are no per-issue start/end dates, and why a milestone without a date is not given a bar.
- `docs/DESIGN.md` §8: retitle to `## 8. Board, matrix, plan, and timeline` and add the t128n ECharts rules (chart-1/2/3, 18% planned fill, HTML label column and legend, month rules, neutral today line, `data-table` for undated milestones, no drag).
- `docs/README.md`: link the timeline under "Use the cockpit" and the "What do you want to do?" table.
- `README.md`: add one bullet under "What it does" for the milestone timeline.
- `tests/timeline-docs.test.ts`: assert the route reference, the how-to section, the explanation section, the DESIGN section and the README bullet.

## Workstreams and file ownership

| Task | Owns | Produces |
| --- | --- | --- |
| T1 server projection | `src/lib/server/planning/timeline.ts`, `src/lib/server/planning/timeline.test.ts` | `milestoneTimeline`, `timelineWindow` |
| T2 ECharts Gantt | `src/lib/components/timeline/timeline-options.ts`, `timeline-format.ts`, `TimelineChart.svelte`, `timeline-options.test.ts`, `timeline-format.test.ts`, `timeline-ui.test.ts` | option builder, HTML label column and chart |
| T3 route + nav | `src/routes/(app)/timeline/+page.server.ts`, `+page.svelte`, `src/lib/components/shell/SidebarNav.svelte`, `src/routes/(app)/milestones/+page.svelte`, `src/lib/styles/tokens.css`, `tests/timeline-page.test.ts` | `/timeline`, nav link, timeline tokens |
| T4 docs | `docs/how-to/use/milestones.md`, `docs/reference/routes-and-pages.md`, `docs/explanation/planning-and-actuals.md`, `docs/DESIGN.md`, `docs/README.md`, `README.md`, `docs/assets/screenshots/*`, `tests/timeline-docs.test.ts` | documentation and previews |

T2 and T3 import the shared contract from `src/lib/timeline.ts`; T3 imports `milestoneTimeline` from T1 and `TimelineChart` from T2. Write against the contract even if the other file has not landed yet; the coordinator runs the full check after all workstreams finish.

## Acceptance criteria

1. `/timeline` lists every open milestone with a due date, earliest due first, and a separate `No due date` table.
2. A bar starts at the earliest of the first planned Monday and the first `in-progress`/`in-review` event; it ends at `due_on`.
3. Progress fill and the `closed/total` label match the mirror counts.
4. Open child issues appear as markers; closed children do not.
5. A milestone with no start signal shows a due tick and `no start`, never a fake bar.
6. A milestone with no due date never appears in the chart and is never given an invented end.
7. The view is read-only: no write endpoints, no drag handlers, no schema change.
8. `/timeline?repo=owner/name` filters the rows; `repos` still lists the unfiltered open set.
9. The chart follows `docs/DESIGN.md` and the t128n skill: Apache ECharts, `chart-1`–`chart-3` series, 18% planned fill, 1px month rules, Geist Sans labels, mono refs, an HTML legend and label column, no gradients or content shadows, no raw hex in component CSS.
10. `bun test`, `bun run check` and `bun run build` pass.
11. Docs cover the how-to, reference, explanation, design language and README.

## Verification

```sh
bun test src/lib/server/planning/timeline.test.ts
bun test src/lib/components/timeline
bun test tests/timeline-page.test.ts tests/timeline-docs.test.ts
bun run check
bun run build
bun test
```

## Explicit non-goals

- Cycles as rows (a future lens; the projection is milestone-scoped today).
- Zoom controls, drag-to-reschedule, dependency arrows, baselines, critical path.
- Per-issue `start_on` / `target_on` columns.
- Two-way calendar or forge date sync.
- Closed-milestone history.
