/**
 * Detail-canvas selection is URL-driven so the open pane is always shareable
 * and survives reloads. Every master view owns its detail route:
 *
 *   /issues/<owner>/<repo>/<n>, /board/..., /inbox/...
 *
 * and staged intake submissions live at `/inbox/submission/<id>`. This module
 * only *navigates*; components read the resolved target straight from the route
 * params (see {@link import("#lib/issue-url").parseIssueParams}) rather than
 * from a query parameter.
 */
import { goto } from "$app/navigation";
import { page } from "$app/state";
import {
  issuePath,
  submissionPath,
  viewOf,
  type ViewId,
} from "#lib/issue-url";

/** The view that owns the current route, defaulting to Issues off-view. */
function currentView(): ViewId {
  return viewOf(page.url.pathname) ?? "issues";
}

/** Navigate to `pathname` while preserving the current query string. */
function go(pathname: string): void {
  const url = new URL(page.url.href);
  url.pathname = pathname;
  void goto(url, { reset: false });
}

/** Open the detail canvas for issue `repo#number` in the current view. */
export function selectIssue(repo: string, number: number): void {
  go(issuePath(currentView(), repo, number));
}

/** Open the detail canvas for staged intake submission `id`. */
export function selectSubmission(id: string): void {
  go(submissionPath(id));
}

/** Dismiss the detail canvas, returning to the current view's list. */
export function clearSelection(): void {
  go(`/${currentView()}`);
}
