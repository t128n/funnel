/**
 * Feed endpoints, row flattening and URL construction (T4).
 *
 * `flattenIssueRows` / `flattenInboxRows` project the loaded window into a
 * flat group-header + row list so Virtua can virtualize sections and rows with
 * one keyed list. `feedUrl` builds a keyset-page URL from the live filters.
 */
import {
  buildGroups,
  type GroupKey,
  type ProjectOption,
} from "#lib/components/issue/grouping";
import type {
  IssueListItem,
  RenderedInboxEntry,
} from "#lib/server/issues/types";

/** Feed endpoints; the board additionally requires a `column` parameter. */
export const FEED_ENDPOINTS = {
  issues: "/api/feeds/issues",
  inbox: "/api/feeds/inbox",
  board: "/api/feeds/board",
} as const;

/** One row in a virtualized feed: a collapsible section header or an item. */
export type FeedRow<T> =
  | { kind: "group"; key: string; label: string; count: number }
  | { kind: "item"; key: string; item: T };

/** Collapse-state key for the Inbox's staged-submission section. */
export const INBOX_SUBMISSIONS_KEY = "inbox:submissions";

/** Stable item key for an issue row (mirror identity). */
function issueKey(issue: IssueListItem): string {
  return `${issue.repoId}:${issue.number}`;
}

/**
 * Flatten issues into Virtua rows.
 *
 * `collapsed` receives the full section key (`${groupBy}:${group.key}`), the
 * same key the group headers persist. A collapsed section still emits its
 * header so it can be expanded again, but no item rows. When the requested
 * dimension produces no sections (no groups, no configured projects), the feed
 * renders flat — matching the non-virtualized list's fallback.
 */
export function flattenIssueRows(
  issues: IssueListItem[],
  groupBy: GroupKey,
  repoShortcodes: Record<string, string>,
  projects: ProjectOption[],
  collapsed: (key: string) => boolean,
): FeedRow<IssueListItem>[] {
  const groups = buildGroups(issues, groupBy, repoShortcodes, projects);
  if (groupBy === "none" || groups.length === 0) {
    return issues.map((item) => ({
      kind: "item" as const,
      key: issueKey(item),
      item,
    }));
  }

  const rows: FeedRow<IssueListItem>[] = [];
  for (const group of groups) {
    const key = `${groupBy}:${group.key}`;
    rows.push({
      kind: "group",
      key,
      label: group.label,
      count: group.issues.length,
    });
    if (collapsed(key)) continue;
    for (const item of group.issues) {
      rows.push({ kind: "item", key: `${key}:${issueKey(item)}`, item });
    }
  }
  return rows;
}

/**
 * Flatten the Inbox queue into Virtua rows.
 *
 * Staged submissions always come first (the actionable part of the queue)
 * under their own collapsible `Staged` section, followed by the issue half
 * grouped exactly like the Issues feed. Entry identity is preserved: item rows
 * carry the original `RenderedInboxEntry`, so submission rows keep their id and
 * rendered body.
 */
export function flattenInboxRows(
  entries: RenderedInboxEntry[],
  groupBy: GroupKey,
  repoShortcodes: Record<string, string>,
  projects: ProjectOption[],
  collapsed: (key: string) => boolean,
): FeedRow<RenderedInboxEntry>[] {
  const rows: FeedRow<RenderedInboxEntry>[] = [];

  const submissions = entries.filter(
    (entry): entry is Extract<RenderedInboxEntry, { kind: "submission" }> =>
      entry.kind === "submission",
  );
  if (submissions.length > 0) {
    rows.push({
      kind: "group",
      key: INBOX_SUBMISSIONS_KEY,
      label: "Staged",
      count: submissions.length,
    });
    if (!collapsed(INBOX_SUBMISSIONS_KEY)) {
      for (const item of submissions) {
        rows.push({
          kind: "item",
          key: `submission:${item.submission.id}`,
          item,
        });
      }
    }
  }

  const issueEntries = new Map<string, RenderedInboxEntry>();
  const issues: IssueListItem[] = [];
  for (const entry of entries) {
    if (entry.kind !== "issue") continue;
    issues.push(entry.issue);
    issueEntries.set(issueKey(entry.issue), entry);
  }

  for (const row of flattenIssueRows(
    issues,
    groupBy,
    repoShortcodes,
    projects,
    collapsed,
  )) {
    if (row.kind === "group") rows.push(row);
    else {
      rows.push({
        kind: "item",
        key: row.key,
        item: issueEntries.get(issueKey(row.item))!,
      });
    }
  }

  return rows;
}

/**
 * Build a feed URL from the current filter parameters.
 *
 * Filter parameters (including the search term) are preserved verbatim, then
 * `extra` and the keyset controls are layered on top. Values set through
 * `extra`, `cursor` and `limit` replace any stale copy already in `search`, so
 * a store can hand this function its last URL safely.
 */
export function feedUrl(
  endpoint: string,
  search: URLSearchParams,
  cursor: string | null,
  extra?: Record<string, string>,
  limit?: number,
): string {
  const params = new URLSearchParams(search);
  if (extra) {
    for (const [key, value] of Object.entries(extra)) params.set(key, value);
  }
  if (cursor !== null && cursor !== "") params.set("cursor", cursor);
  if (limit !== undefined) params.set("limit", String(limit));
  const query = params.toString();
  return query ? `${endpoint}?${query}` : endpoint;
}
