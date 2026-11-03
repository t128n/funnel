/**
 * Detail navigation for Composition A.
 *
 * Issues have one dedicated detail route (`/issues/<owner>/<repo>/<n>`); there
 * are no per-view split panes. Staged intake submissions keep their own review
 * route (`/inbox/submission/<id>`) because they are not mirrored issues yet.
 *
 * This module only *navigates*; components read the resolved target straight
 * from the route params (see {@link import("#lib/issue-url").parseIssueParams})
 * rather than from a query parameter.
 */
import { goto } from "$app/navigation";
import { page } from "$app/state";
import { issuePath, submissionPath } from "#lib/issue-url";

/** Navigate to `pathname` while preserving the current query string. */
function go(pathname: string): void {
  const url = new URL(page.url.href);
  url.pathname = pathname;
  void goto(url, { reset: false });
}

/** Open the dedicated detail page for issue `repo#number`. */
export function selectIssue(repo: string, number: number): void {
  go(issuePath("issues", repo, number));
}

/** Open the review page for staged intake submission `id`. */
export function selectSubmission(id: string): void {
  go(submissionPath(id));
}

/** Leave a detail page and return to its index. */
export function clearSelection(): void {
  const path = page.url.pathname;
  if (path.startsWith("/inbox/submission/")) go("/inbox");
  else if (path.startsWith("/issues/")) go("/issues");
  else if (path.startsWith("/board/")) go("/board");
  else if (path.startsWith("/matrix/")) go("/matrix");
  else if (path.startsWith("/inbox/")) go("/inbox");
  else go("/issues");
}
