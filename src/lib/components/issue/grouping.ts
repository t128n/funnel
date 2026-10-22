import { BOARD_COLUMNS } from '#lib/labels';
import { PRIORITY_VALUES, priorityMeta } from '#lib/priority';
import type { IssueListItem } from '#lib/server/issues/types';

/**
 * Client-side sectioning for the flat issue streams (SPEC §9.2). The server
 * returns one filtered list; the cockpit is free to group it without another
 * round-trip, so grouping stays a pure, dependency-free projection.
 */
export type GroupKey = 'none' | 'status' | 'priority' | 'project' | 'repo' | 'milestone';

export interface IssueGroup {
  /** Stable identity for keys and collapse state. */
  key: string;
  label: string;
  issues: IssueListItem[];
}

/** One configurable project indicator (SPEC `projects`). */
export interface ProjectOption {
  /** GitHub label that marks an issue as belonging to the project. */
  label: string;
  /** Display name for the section header. */
  name: string;
}

/** Sentinel key for issues that match no configured project label. */
const NO_PROJECT = '\u0000none';

/** Sentinel key for issues with no milestone (milestones are repo-scoped). */
const NO_MILESTONE = '\u0000nomilestone';

/** Stable section key for a repo-scoped milestone. */
function milestoneKey(milestone: NonNullable<IssueListItem['milestone']>): string {
  return `${milestone.repo}#${milestone.number}`;
}

/** Status sections follow the board's column order; `n` sorts last. */
const STATUS_ORDER = [...BOARD_COLUMNS.map((column) => column.key), 'none'];
const STATUS_LABEL = new Map(BOARD_COLUMNS.map((column) => [column.key, column.label]));

const PRIORITY_ORDER = [...PRIORITY_VALUES, 'none'];
function priorityLabel(key: string): string {
  if (key === 'none') return 'No priority';
  const meta = priorityMeta(key);
  return meta ? `${meta.value} · ${meta.name}` : key;
}

/** Closed issues and explicit `done` share the board's Done window. */
function statusKey(issue: IssueListItem): string {
  if (issue.state === 'closed' || issue.status === 'done') return 'done';
  return issue.status ?? 'none';
}

function statusLabel(key: string): string {
  if (key === 'done') return 'Done';
  if (key === 'none') return 'Untriaged';
  return STATUS_LABEL.get(key) ?? key;
}

function groupKeys(
  issue: IssueListItem,
  groupBy: GroupKey,
  projects: readonly ProjectOption[]
): string[] {
  if (groupBy === 'priority') return [issue.priority ?? 'none'];
  if (groupBy === 'repo') return [issue.repo];
  if (groupBy === 'milestone') return [issue.milestone ? milestoneKey(issue.milestone) : NO_MILESTONE];
  if (groupBy === 'project') return projectKeys(issue, projects);
  return [statusKey(issue)];
}

/**
 * Every configured project whose label is on the issue (case-insensitive, in
 * configured order). An issue can belong to several projects at once, so it is
 * repeated across each matching section; with no match it lands in
 * {@link NO_PROJECT}.
 */
function projectKeys(issue: IssueListItem, projects: readonly ProjectOption[]): string[] {
  const labels = new Set(issue.labels.map((label) => label.toLowerCase()));
  const keys = projects
    .filter((project) => labels.has(project.label.toLowerCase()))
    .map((project) => project.label);
  return keys.length > 0 ? keys : [NO_PROJECT];
}

function groupLabel(
  key: string,
  groupBy: GroupKey,
  repoShortcodes: Record<string, string>,
  projects: readonly ProjectOption[]
): string {
  if (groupBy === 'priority') return priorityLabel(key);
  if (groupBy === 'repo') return repoShortcodes[key] ?? key;
  if (groupBy === 'project') {
    if (key === NO_PROJECT) return 'No project';
    return projects.find((project) => project.label === key)?.name ?? key;
  }
  return statusLabel(key);
}

/**
 * Partition issues into ordered, non-empty sections. Returns `[]` when the
 * caller asked for no grouping (the stream renders flat) or when project
 * grouping is requested but no projects are configured. Under project grouping
 * an issue may appear in several sections when it carries multiple project
 * labels.
 */
export function buildGroups(
  issues: readonly IssueListItem[],
  groupBy: GroupKey,
  repoShortcodes: Record<string, string> = {},
  projects: readonly ProjectOption[] = []
): IssueGroup[] {
  if (groupBy === 'none') return [];
  if (groupBy === 'project' && projects.length === 0) return [];
  // Nothing to section when no issue carries a milestone.
  if (groupBy === 'milestone' && !issues.some((issue) => issue.milestone !== null)) return [];

  const buckets = new Map<string, IssueListItem[]>();
  const milestoneLabels = new Map<string, string>();
  for (const issue of issues) {
    for (const key of groupKeys(issue, groupBy, projects)) {
      const bucket = buckets.get(key);
      if (bucket) bucket.push(issue);
      else buckets.set(key, [issue]);
      if (groupBy === 'milestone' && !milestoneLabels.has(key)) {
        milestoneLabels.set(key, issue.milestone?.title || 'Untitled milestone');
      }
    }
  }

  const milestoneOrder = [...buckets.keys()]
    .filter((key) => key !== NO_MILESTONE)
    .sort((a, b) =>
      (milestoneLabels.get(a) ?? a).localeCompare(milestoneLabels.get(b) ?? b)
    )
    .concat(buckets.has(NO_MILESTONE) ? [NO_MILESTONE] : []);

  const order =
    groupBy === 'status'
      ? STATUS_ORDER
      : groupBy === 'priority'
        ? PRIORITY_ORDER
        : groupBy === 'project'
          ? [...projects.map((project) => project.label), NO_PROJECT]
          : groupBy === 'milestone'
            ? milestoneOrder
            : [...buckets.keys()].sort((a, b) =>
                groupLabel(a, groupBy, repoShortcodes, projects).localeCompare(
                  groupLabel(b, groupBy, repoShortcodes, projects)
                )
              );

  return order
    .filter((key) => buckets.has(key))
    .map((key) => ({
      key,
      label:
        groupBy === 'milestone'
          ? key === NO_MILESTONE
            ? 'No milestone'
            : (milestoneLabels.get(key) ?? key)
          : groupLabel(key, groupBy, repoShortcodes, projects),
      issues: buckets.get(key)!
    }));
}
