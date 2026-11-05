/**
 * Saved-view vocabulary shared by the server service, the JSON API and the
 * client switcher.
 *
 * A saved view is a *named URL preset*, never a second source of truth: the
 * live URL still owns filter/sort/group state, and opening a view simply
 * navigates to the stored path + query. Keeping the serialization here (rather
 * than in the Svelte component) means the round trip can be unit-tested
 * without a browser and the server validates the same shapes it reads.
 */
import {
  DEFAULT_DIRECTION,
  DEFAULT_SORT,
  DIRECTION_VALUES,
  toFilterParams,
  type ClientFilter,
  type IssueSort,
  type SortDirection,
} from "./url-filter";
import type { GroupKey } from "./components/issue/grouping";

/** Paths a saved view may open. */
export const SAVED_VIEW_SCOPES = ["issues", "inbox"] as const;
export type SavedViewScope = (typeof SAVED_VIEW_SCOPES)[number];

/** Grouping dimensions the issue list understands. */
export const SAVED_VIEW_GROUPS = [
  "none",
  "status",
  "priority",
  "project",
  "repo",
  "milestone",
  "type",
] as const;
export type SavedViewGroup = (typeof SAVED_VIEW_GROUPS)[number];

/** Longest accepted display name. */
export const MAX_SAVED_VIEW_NAME = 120;
/** Longest accepted query string, comfortably above a fully-populated view. */
export const MAX_SAVED_VIEW_QUERY = 2000;

/** One saved view row, as returned by the service and the JSON API. */
export interface SavedView {
  id: string;
  ownerUserId: string;
  name: string;
  /** Query string without a leading `?`. */
  query: string;
  scope: SavedViewScope;
  sort: IssueSort | null;
  direction: SortDirection | null;
  group: SavedViewGroup | null;
  shared: boolean;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Caller-supplied fields for creating a view. */
export interface SavedViewInput {
  name: string;
  query: string;
  scope: string;
  sort?: string | null;
  direction?: string | null;
  group?: string | null;
  shared?: boolean;
  pinned?: boolean;
}

/** Fields an update may change; omitted fields keep their stored value. */
export type SavedViewPatch = Partial<SavedViewInput>;

/** Whether a raw value names a scope a saved view can open. */
export function isSavedViewScope(value: unknown): value is SavedViewScope {
  return (
    typeof value === "string" &&
    (SAVED_VIEW_SCOPES as readonly string[]).includes(value)
  );
}

/** Whether a raw value is a supported grouping dimension. */
export function isSavedViewGroup(value: unknown): value is SavedViewGroup {
  return (
    typeof value === "string" &&
    (SAVED_VIEW_GROUPS as readonly string[]).includes(value)
  );
}

/** Whether a raw value is a supported sort dimension. */
export function isSavedViewSort(value: unknown): value is IssueSort {
  return (
    typeof value === "string" &&
    (["priority", "updated", "created", "title"] as readonly string[]).includes(
      value,
    )
  );
}

/** Whether a raw value is a supported sort direction. */
export function isSavedViewDirection(value: unknown): value is SortDirection {
  return (
    typeof value === "string" &&
    (DIRECTION_VALUES as readonly string[]).includes(value)
  );
}

/**
 * Build the URL that opens a saved view. `sort`/`direction` live in dedicated
 * columns, so they are applied on top of the stored query instead of being
 * duplicated inside it; storing the defaults clears any stale value already
 * present in the query.
 */
export function savedViewUrl(
  view: Pick<SavedView, "scope" | "query" | "sort" | "direction">,
): string {
  const params = new URLSearchParams(view.query);
  params.delete("sort");
  params.delete("direction");
  if (view.sort !== null && view.sort !== DEFAULT_SORT) {
    params.set("sort", view.sort);
  }
  if (view.direction !== null && view.direction !== DEFAULT_DIRECTION) {
    params.set("direction", view.direction);
  }
  const query = params.toString();
  return `/${view.scope}${query ? `?${query}` : ""}`;
}

/**
 * Serialize the current filter state for storage. Sort and direction are
 * removed because they have their own columns; `snoozed` is preserved when
 * saving an Inbox view so the Snoozed list reopens as such.
 */
export function savedViewQuery(
  filter: ClientFilter,
  options: { snoozed?: boolean } = {},
): string {
  const params = toFilterParams(filter);
  params.delete("sort");
  params.delete("direction");
  if (options.snoozed) params.set("snoozed", "1");
  return params.toString();
}

/** True when a view belongs to the given user or was shared instance-wide. */
export function isSavedViewVisibleTo(
  view: Pick<SavedView, "ownerUserId" | "shared">,
  userId: string,
): boolean {
  return view.ownerUserId === userId || view.shared;
}
