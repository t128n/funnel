/**
 * URL ⇄ filter state serialization for the filter bar (SPEC §9.4).
 *
 * Filter and search state is bidirectionally mirrored to the URL so any view is
 * bookmarkable and shareable. This module is pure and dependency-free: it reads
 * and writes the same query keys the server-side {@link import("./server/issues/filters").parseIssueFilter}
 * consumes (`repo`, `status`, `assignee`, `priority`, `size`, `label`, `q`).
 *
 * Repos are held as `owner/name` slugs and assignees as logins (or the `me`
 * sentinel), which is exactly what the server resolves against the mirror.
 */

export interface ClientFilter {
  /** `owner/name` slugs. */
  repos: string[];
  /** `open` and/or `closed`; absence means the server's default (`open`). */
  states: string[];
  /** Canonical status names and/or `none`. */
  statuses: string[];
  /** GitHub logins, numeric ids, or `me`. */
  assignees: string[];
  /** `p1`-`p3` and/or `none`. */
  priorities: string[];
  /** `sm`/`md`/`lg` and/or `none`. */
  sizes: string[];
  /** Non-reserved label names. */
  labels: string[];
  /** Repo-scoped milestone slugs (`owner/name#number`) and/or `none`. */
  milestones: string[];
  /** Free-text search term. */
  search: string;
}

export const EMPTY_CLIENT_FILTER: ClientFilter = {
  repos: [],
  states: [],
  statuses: [],
  assignees: [],
  priorities: [],
  sizes: [],
  labels: [],
  milestones: [],
  search: "",
};

/** Sentinel selecting items missing the label for a dimension (matches the server). */
export const NONE = "none";

/** The query keys owned by the filter bar; everything else is preserved. */
export const FILTER_KEYS = [
  "repo",
  "state",
  "status",
  "assignee",
  "priority",
  "size",
  "label",
  "milestone",
  "q",
] as const;

/**
 * The read-only slice of `URLSearchParams` the parser needs. Both
 * `URLSearchParams` and SvelteKit's `ReadonlyURLSearchParams` satisfy it.
 */
export interface FilterParams {
  get(name: string): string | null;
  getAll(name: string): string[];
  forEach(callback: (value: string, key: string) => void): void;
}

/** Collect a repeated, possibly comma-joined parameter into a trimmed list. */
function collect(params: FilterParams, key: string): string[] {
  const out: string[] = [];
  for (const raw of params.getAll(key)) {
    for (const part of raw.split(",")) {
      const value = part.trim();
      if (value.length > 0 && !out.includes(value)) out.push(value);
    }
  }
  return out;
}

/** Parse filter state out of a URL's query parameters. */
export function parseFilterParams(params: FilterParams): ClientFilter {
  return {
    repos: collect(params, "repo"),
    states: collect(params, "state"),
    statuses: collect(params, "status"),
    assignees: collect(params, "assignee"),
    priorities: collect(params, "priority"),
    sizes: collect(params, "size"),
    labels: collect(params, "label"),
    milestones: collect(params, "milestone"),
    search: (params.get("q") ?? "").trim(),
  };
}

/**
 * Serialize filter state into query parameters. Empty dimensions are omitted;
 * populated ones use repeated keys for stable, human-readable URLs.
 */
export function toFilterParams(filter: ClientFilter): URLSearchParams {
  const params = new URLSearchParams();
  const groups: Array<[string, readonly string[]]> = [
    ["repo", filter.repos],
    ["state", filter.states],
    ["status", filter.statuses],
    ["assignee", filter.assignees],
    ["priority", filter.priorities],
    ["size", filter.sizes],
    ["label", filter.labels],
    ["milestone", filter.milestones],
  ];
  for (const [key, values] of groups) {
    for (const value of values) if (value) params.append(key, value);
  }
  if (filter.search.trim()) params.set("q", filter.search.trim());
  return params;
}

/**
 * Merge the filter into the current query string while preserving unrelated
 * params. Filter keys present in the current URL are dropped first so toggling
 * off actually removes them.
 */
export function buildFilterUrl(
  pathname: string,
  current: FilterParams,
  filter: ClientFilter,
): string {
  const next = new URLSearchParams();
  current.forEach((value, key) => next.append(key, value));
  for (const key of FILTER_KEYS) next.delete(key);
  for (const [key, value] of toFilterParams(filter)) next.append(key, value);
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** Immutably add/remove a value from a multi-select dimension. */
export function toggleValue(
  values: readonly string[],
  value: string,
): string[] {
  return values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value];
}

/** Number of active filter dimensions (not values); drives the bar badge. */
export function activeFilterCount(filter: ClientFilter): number {
  return (
    (filter.repos.length > 0 ? 1 : 0) +
    (filter.states.length > 0 ? 1 : 0) +
    (filter.statuses.length > 0 ? 1 : 0) +
    (filter.assignees.length > 0 ? 1 : 0) +
    (filter.priorities.length > 0 ? 1 : 0) +
    (filter.sizes.length > 0 ? 1 : 0) +
    (filter.labels.length > 0 ? 1 : 0) +
    (filter.milestones.length > 0 ? 1 : 0) +
    (filter.search.trim().length > 0 ? 1 : 0)
  );
}

/** True when no dimension constrains the result set. */
export function isEmptyFilter(filter: ClientFilter): boolean {
  return activeFilterCount(filter) === 0;
}
