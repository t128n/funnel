/**
 * Milestone timeline projection (read-only).
 *
 * Folds the disposable mirror (`mirror_milestone`), Funnel-owned plan intent
 * (`state_plan_item`) and the observed status log (`state_issue_event`) into the
 * shared {@link MilestoneTimeline} contract. Every time input already exists, so
 * the projection invents no per-issue start or end date and never clamps a plan
 * week that landed after its due date — the UI flags it instead.
 *
 * Reads are batched: one milestone query, one open-issue query, one grouped
 * event query and one grouped triage lookup. A wide milestone therefore never
 * degrades into N+1 lookups.
 */
import { and, eq, inArray, min, sql } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import { mirrorThread, stateIssueEvent } from "#lib/server/db/schema";
import { listMilestones } from "#lib/server/issues/queries";
import type { MilestoneItem } from "#lib/server/issues/types";
import type {
  MilestoneTimeline,
  TimelineMarker,
  TimelineRow,
  TimelineStartSource,
  TimelineWindow,
} from "#lib/timeline";
import type { PlanningIssue } from "./queries";
import { listMilestoneIssues } from "./queries";

/** Optional narrowing for {@link milestoneTimeline}. */
export interface TimelineFilter {
  /** `owner/name`; rows from other repositories are omitted. */
  repo?: string;
}

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
/** A short project still deserves a readable horizontal scale. */
const MIN_WINDOW_WEEKS = 8;
/** One week of breathing room on each side of the data. */
const WINDOW_PAD_MS = WEEK_MS;

/** `owner/name` + number identity used to group milestones and issues. */
function keyOf(repo: string, number: number): string {
  return `${repo}\u0000${number}`;
}

/**
 * Parse a Monday `YYYY-MM-DD` plan week into its UTC-midnight instant. The
 * rollover check rejects impossible dates such as `2026-02-30`, matching
 * `planning/calendar.ts`.
 */
function planWeekMs(weekStart: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekStart);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ms = Date.UTC(year, month - 1, day);
  const date = new Date(ms);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return ms;
}

/** Floor a Unix-millisecond instant to 00:00 UTC on its Monday. */
function startOfMonday(ms: number): number {
  const date = new Date(ms);
  const midnight = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  const offset = (date.getUTCDay() + 6) % 7; // Monday -> 0 … Sunday -> 6
  return midnight - offset * DAY_MS;
}

/**
 * The earliest `in-progress`/`in-review` status transition per issue, in one
 * grouped query. Only observed transitions count; a plan week is intent, not an
 * actual.
 */
function earliestActiveEvents(): Map<string, number> {
  const rows = db
    .select({
      org: stateIssueEvent.org,
      name: stateIssueEvent.name,
      issueNumber: stateIssueEvent.issueNumber,
      at: min(stateIssueEvent.at),
    })
    .from(stateIssueEvent)
    .where(
      and(
        eq(stateIssueEvent.kind, "status"),
        inArray(stateIssueEvent.toValue, ["in-progress", "in-review"]),
      ),
    )
    .groupBy(
      stateIssueEvent.org,
      stateIssueEvent.name,
      stateIssueEvent.issueNumber,
    )
    .all();

  const events = new Map<string, number>();
  for (const row of rows) {
    if (row.at === null) continue;
    events.set(keyOf(`${row.org}/${row.name}`, row.issueNumber), row.at);
  }
  return events;
}

/**
 * Triage flags for the projected issues, in one batched query. `PlanningIssue`
 * deliberately carries only scheduling data, so the orthogonal `status` and
 * `blocked` values are read here rather than widening the planner's read model.
 */
function triageFlags(
  issues: readonly PlanningIssue[],
): Map<string, { status: string | null; blocked: boolean }> {
  const flags = new Map<string, { status: string | null; blocked: boolean }>();
  if (issues.length === 0) return flags;

  const tuple = sql.join(
    issues.map((issue) => sql`(${issue.repoId}, ${issue.number})`),
    sql`, `,
  );
  const rows = db
    .select({
      repoId: mirrorThread.repoId,
      number: mirrorThread.number,
      status: mirrorThread.status,
      blocked: mirrorThread.blocked,
    })
    .from(mirrorThread)
    .where(sql`(${mirrorThread.repoId}, ${mirrorThread.number}) IN (${tuple})`)
    .all();

  const repos = new Map<number, string>();
  for (const issue of issues) repos.set(issue.repoId, issue.repo);
  for (const row of rows) {
    const repo = repos.get(row.repoId);
    if (repo === undefined) continue;
    flags.set(keyOf(repo, row.number), {
      status: row.status,
      blocked: row.blocked !== 0,
    });
  }
  return flags;
}

/** A marker anchor: when a child issue entered the bar, and why. */
interface Anchor {
  at: number;
  source: TimelineStartSource;
}

/**
 * The earliest of the plan week and the observed transition. A plan week wins
 * ties because it is Funnel-owned intent; `active` only wins when it is strictly
 * earlier.
 */
function anchorOf(
  issue: PlanningIssue,
  activeAt: number | undefined,
): Anchor | null {
  const plan = issue.weekStart === null ? null : planWeekMs(issue.weekStart);
  if (plan !== null && (activeAt === undefined || plan <= activeAt)) {
    return { at: plan, source: "plan" };
  }
  if (activeAt !== undefined) return { at: activeAt, source: "active" };
  return null;
}

/** Narrow the planner's cached priority string onto the shared union. */
function asPriority(value: string | null): TimelineMarker["priority"] {
  return value === "P1" || value === "P2" || value === "P3" ? value : null;
}

/** Project one open milestone and its open child issues into a timeline row. */
function projectRow(
  milestone: MilestoneItem,
  issues: readonly PlanningIssue[],
  activeEvents: ReadonlyMap<string, number>,
  triage: ReadonlyMap<string, { status: string | null; blocked: boolean }>,
): TimelineRow {
  const markers: TimelineMarker[] = [];
  for (const issue of issues) {
    const issueKey = keyOf(issue.repo, issue.number);
    const anchor = anchorOf(issue, activeEvents.get(issueKey));
    if (anchor === null) continue;
    const flags = triage.get(issueKey);
    markers.push({
      repo: issue.repo,
      number: issue.number,
      title: issue.title,
      status: flags?.status ?? null,
      priority: asPriority(issue.priority),
      blocked: flags?.blocked ?? false,
      at: anchor.at,
      source: anchor.source,
    });
  }
  markers.sort((a, b) => a.at - b.at || a.number - b.number);

  const first = markers[0] ?? null;
  return {
    repo: milestone.repo,
    number: milestone.number,
    title: milestone.title,
    dueOn: milestone.dueOn,
    startOn: first?.at ?? null,
    startSource: first?.source ?? null,
    openIssues: milestone.openIssues,
    closedIssues: milestone.closedIssues,
    progress: milestone.progress,
    markers,
  };
}

/**
 * The visible date span for a set of rows.
 *
 * `start` is floored to Monday 00:00 UTC and `end` is the following Monday
 * 00:00 UTC (exclusive), so a bar never appears to touch an edge. `now` is
 * always inside the window; the pad and the eight-week minimum keep a short
 * project from collapsing into a single tick.
 */
export function timelineWindow(
  rows: readonly Pick<TimelineRow, "startOn" | "dueOn">[],
  now: number,
): TimelineWindow | null {
  const dated: Array<{ startOn: number | null; dueOn: number }> = [];
  for (const row of rows) {
    if (row.dueOn !== null) {
      dated.push({ startOn: row.startOn, dueOn: row.dueOn });
    }
  }
  if (dated.length === 0) return null;

  let lo = now;
  let hi = now;
  for (const row of dated) {
    lo = Math.min(lo, row.startOn ?? row.dueOn);
    hi = Math.max(hi, row.dueOn);
  }

  const start = startOfMonday(lo - WINDOW_PAD_MS);
  const paddedEnd = hi + WINDOW_PAD_MS;
  let end = startOfMonday(paddedEnd);
  // Snap *up* to the next Monday: an exact Monday boundary already excludes
  // the padded instant, any other day needs the following week.
  if (end < paddedEnd) end += WEEK_MS;
  const minEnd = start + MIN_WINDOW_WEEKS * WEEK_MS;
  if (end < minEnd) end = minEnd;

  return { start, end };
}

/**
 * Project every open milestone into the milestone timeline.
 *
 * Closed milestones are history and stay off the view. `filter.repo` narrows the
 * projected rows only; `repos` always reflects the unfiltered open-milestone
 * set so a repo picker does not lose its options while filtered.
 */
export function milestoneTimeline(
  now: Date | number = Date.now(),
  filter: TimelineFilter = {},
): MilestoneTimeline {
  const nowMs = typeof now === "number" ? now : now.getTime();

  const openMilestones = listMilestones().filter(
    (milestone) => milestone.state === "open",
  );
  const repos = [
    ...new Set(openMilestones.map((milestone) => milestone.repo)),
  ].sort((a, b) => a.localeCompare(b));
  const selected =
    filter.repo === undefined
      ? openMilestones
      : openMilestones.filter((milestone) => milestone.repo === filter.repo);

  const issues = listMilestoneIssues();
  const activeEvents = earliestActiveEvents();
  const triage = triageFlags(issues);

  const issuesByMilestone = new Map<string, PlanningIssue[]>();
  for (const issue of issues) {
    const milestone = issue.milestone;
    if (milestone === null) continue;
    const key = keyOf(issue.repo, milestone.number);
    const group = issuesByMilestone.get(key);
    if (group === undefined) issuesByMilestone.set(key, [issue]);
    else group.push(issue);
  }

  const rows: TimelineRow[] = [];
  const undated: TimelineRow[] = [];
  for (const milestone of selected) {
    const row = projectRow(
      milestone,
      issuesByMilestone.get(keyOf(milestone.repo, milestone.number)) ?? [],
      activeEvents,
      triage,
    );
    if (row.dueOn === null) undated.push(row);
    else rows.push(row);
  }

  rows.sort(
    (a, b) =>
      (a.dueOn as number) - (b.dueOn as number) ||
      a.repo.localeCompare(b.repo) ||
      a.number - b.number,
  );
  undated.sort((a, b) => a.repo.localeCompare(b.repo) || a.number - b.number);

  return {
    rows,
    undated,
    window: timelineWindow(rows, nowMs),
    now: nowMs,
    repos,
  };
}
