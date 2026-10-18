/**
 * URL model for the cockpit's path-based detail panes.
 *
 * Every master view owns its detail routes so deep links are self-describing
 * and free of percent-encoding:
 *
 *   /issues/<owner>/<repo>/<n>
 *   /board/<owner>/<repo>/<n>
 *   /inbox/<owner>/<repo>/<n>
 *   /inbox/submission/<id>
 *
 * The selection is a path segment rather than a `?issue=` query parameter, so
 * the server and client resolve an issue straight from the route params — no
 * reverse lookup or shortcode table involved. This module is pure and
 * dependency-free so it can be imported from both components and tests.
 */

/** The three cockpit views that dock a detail pane beside their feed. */
export type ViewId = "issues" | "board" | "inbox";

export const VIEWS: readonly ViewId[] = ["issues", "board", "inbox"];

/** Detail route params as SvelteKit hands them to a component (all strings). */
export interface IssueParams {
  owner?: string | undefined;
  repo?: string | undefined;
  number?: string | undefined;
}

/** Split an `owner/name` slug into its path segments. */
function repoSegments(repo: string): [string, string] {
  const slash = repo.indexOf("/");
  if (slash <= 0) return [repo, ""];
  return [repo.slice(0, slash), repo.slice(slash + 1)];
}

/** `/issues/<owner>/<repo>/<n>` for the given view. */
export function issuePath(view: ViewId, repo: string, number: number): string {
  const [owner, name] = repoSegments(repo);
  return `/${view}/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/${number}`;
}

/** `/inbox/submission/<id>` for a staged intake submission. */
export function submissionPath(id: string): string {
  return `/inbox/submission/${encodeURIComponent(id)}`;
}

/** The cockpit view a pathname belongs to, or `null` outside the views. */
export function viewOf(pathname: string): ViewId | null {
  const first = pathname.split("/").filter(Boolean)[0];
  return VIEWS.includes(first as ViewId) ? (first as ViewId) : null;
}

/** Parse `owner/repo/number` detail params into a validated selection. */
export function parseIssueParams(
  params: IssueParams,
): { repo: string; number: number } | null {
  const { owner, repo, number } = params;
  if (!owner || !repo || !number || !/^\d+$/.test(number)) return null;
  const value = Number(number);
  if (!Number.isInteger(value) || value <= 0) return null;
  return { repo: `${owner}/${repo}`, number: value };
}
