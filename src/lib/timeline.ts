/**
 * Shared milestone-timeline vocabulary.
 *
 * The timeline is a read-only projection over facts Funnel already has:
 * milestone due dates, plan weeks (`state_plan_item`) and observed status
 * transitions (`state_issue_event`). It deliberately adds no per-issue start or
 * end date, no schedule table and no writable bar. A bar that cannot be derived
 * from those facts is not drawn.
 *
 * This module is dependency-free so the server projection and the Svelte
 * components can share one definition without importing the database.
 */

/** Where a row or marker anchor came from. */
export type TimelineStartSource = "plan" | "active";

/** One open child issue positioned inside its milestone's bar. */
export interface TimelineMarker {
  /** `owner/name` of the issue's repository. */
  repo: string;
  number: number;
  title: string;
  /** Derived reserved-label status, or `null` when untriaged. */
  status: string | null;
  priority: "P1" | "P2" | "P3" | null;
  /** The orthogonal `blocked` flag; markers colour differently when set. */
  blocked: boolean;
  /** Unix milliseconds of the anchor. */
  at: number;
  source: TimelineStartSource;
}

/** One milestone row in the timeline. */
export interface TimelineRow {
  /** `owner/name` of the milestone's repository. */
  repo: string;
  number: number;
  title: string;
  /** Milestone due date in Unix milliseconds; `null` for an undated row. */
  dueOn: number | null;
  /**
   * Earliest anchor across the milestone's open issues: the first planned
   * week, or the first observed `in-progress`/`in-review` transition. `null`
   * when no issue has either signal.
   */
  startOn: number | null;
  startSource: TimelineStartSource | null;
  openIssues: number;
  closedIssues: number;
  /** Closed / (open + closed), from the mirror. `0` for an empty milestone. */
  progress: number;
  markers: TimelineMarker[];
}

/** The visible date span. `end` is exclusive. */
export interface TimelineWindow {
  /** Unix milliseconds at 00:00 UTC on the first Monday shown. */
  start: number;
  /** Unix milliseconds at 00:00 UTC on the day after the last Sunday shown. */
  end: number;
}

/** The complete payload a timeline route renders. */
export interface MilestoneTimeline {
  /** Open milestones with a due date, earliest due first. */
  rows: TimelineRow[];
  /** Open milestones without a due date; shown as a table, never a fake bar. */
  undated: TimelineRow[];
  /** `null` when no open milestone has a due date. */
  window: TimelineWindow | null;
  /** The instant the projection was computed, used for the today line. */
  now: number;
  /** Every repository that contributed a row or an undated milestone. */
  repos: string[];
}

/** `/milestones/{owner}/{repo}/{number}` for a repo-scoped milestone. */
export function milestonePath(repo: string, number: number): string {
  const slash = repo.indexOf("/");
  const owner = slash > 0 ? repo.slice(0, slash) : repo;
  const name = slash > 0 ? repo.slice(slash + 1) : "";
  return `/milestones/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/${number}`;
}
