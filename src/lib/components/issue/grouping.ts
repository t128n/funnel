import { BOARD_COLUMNS } from '#lib/labels';
import type { IssueListItem } from '#lib/server/issues/types';

/**
 * Client-side sectioning for the flat issue streams (SPEC §9.2). The server
 * returns one filtered list; the cockpit is free to group it without another
 * round-trip, so grouping stays a pure, dependency-free projection.
 */
export type GroupKey = 'none' | 'status' | 'priority' | 'project' | 'repo';

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

/** Status sections follow the board's column order; `n` sorts last. */
const STATUS_ORDER = [...BOARD_COLUMNS.map((column) => column.key), 'none'];
const STATUS_LABEL = new Map(BOARD_COLUMNS.map((column) => [column.key, column.label]));

const PRIORITY_ORDER = ['p1', 'p2', 'p3', 'none'];
const PRIORITY_LABEL: Record<string, string> = {
  p1: 'P1 · Critical',
  p2: 'P2 · High',
  p3: 'P3 · Normal',
  none: 'No priority'
};

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
  if (groupBy === 'priority') return PRIORITY_LABEL[key] ?? key;
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

  const buckets = new Map<string, IssueListItem[]>();
  for (const issue of issues) {
    for (const key of groupKeys(issue, groupBy, projects)) {
      const bucket = buckets.get(key);
      if (bucket) bucket.push(issue);
      else buckets.set(key, [issue]);
    }
  }

  const order =
    groupBy === 'status'
      ? STATUS_ORDER
      : groupBy === 'priority'
        ? PRIORITY_ORDER
        : groupBy === 'project'
          ? [...projects.map((project) => project.label), NO_PROJECT]
          : [...buckets.keys()].sort((a, b) =>
              groupLabel(a, groupBy, repoShortcodes, projects).localeCompare(
                groupLabel(b, groupBy, repoShortcodes, projects)
              )
            );

  return order
    .filter((key) => buckets.has(key))
    .map((key) => ({
      key,
      label: groupLabel(key, groupBy, repoShortcodes, projects),
      issues: buckets.get(key)!
    }));
}
