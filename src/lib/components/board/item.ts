import type { IssueListItem } from "#lib/server/issues/types";

/**
 * One draggable board card. `svelte-dnd-action` requires each item to carry an
 * `id`, so the issue is wrapped rather than mutated: the library adds its own
 * shadow marker to these objects during a drag.
 */
export interface BoardItem {
  id: string;
  issue: IssueListItem;
  /** Set by `svelte-dnd-action` for the placeholder left in the source zone. */
  isDndShadowItem?: boolean;
}

/** Wrap an issue for the drag zone. */
export function toBoardItem(issue: IssueListItem): BoardItem {
  return { id: `${issue.repo}#${issue.number}`, issue };
}
