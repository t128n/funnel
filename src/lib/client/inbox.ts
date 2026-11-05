/**
 * Inbox queue presentation helpers.
 *
 * Kept DOM-free so the empty-state branch and the same-route action URL can be
 * regression-tested without mounting the Svelte page.
 */

/** The two empty states the queue can render. */
export type InboxEmptyState = "clear" | "no-match";

export interface InboxCounts {
  /** Submissions in the projected (visible) queue. */
  submissions: number;
  /** Untriaged issues in the whole filtered queue. */
  untriaged: number;
  /** Rows visible under the active filter. */
  matching: number;
  /** Unfiltered queue size (the navbar badge count). */
  queueTotal: number;
  /** Whether any filter/search is narrowing the view. */
  filtered: boolean;
}

/** Pluralize a count with its noun. */
function countOf(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Summary under the page heading. A filtered view reports how many of the
 * queued items match instead of pretending the queue only contains the
 * filtered rows.
 */
export function inboxSummary(counts: InboxCounts): string {
  if (counts.filtered) {
    return `Showing ${counts.matching} of ${countOf(
      counts.queueTotal,
      "queued item",
    )} · filtered`;
  }
  return `${countOf(counts.submissions, "submission")} · ${countOf(
    counts.untriaged,
    "untriaged issue",
  )}`;
}

/**
 * Distinguish a genuinely empty queue from a filter with no matches. The
 * success state is only valid when the underlying queue is empty.
 */
export function inboxEmptyState(queueTotal: number): InboxEmptyState {
  return queueTotal === 0 ? "clear" : "no-match";
}

/**
 * Build a same-route named-action URL that preserves the current query string,
 * e.g. `?q=zzzz&/accept`. SvelteKit reads the first `/<name>` parameter as the
 * action and leaves the rest in `url.searchParams`, so a no-JS post returns to
 * the same filtered queue rather than an action-only URL.
 */
export function inboxActionUrl(
  search: string,
  action: "accept" | "dismiss" | "undo",
): string {
  const query = search.startsWith("?") ? search.slice(1) : search;
  return query ? `?${query}&/${action}` : `?/${action}`;
}
