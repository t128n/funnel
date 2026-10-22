import { parseIssueFilter } from "#lib/server/issues/filters";
import type { ListPage } from "#lib/server/issues/pagination";
import { allIssues, filterContext } from "#lib/server/issues/queries";
import type { IssueListItem } from "#lib/server/issues/types";
import type { LayoutServerLoad } from "./$types";

/**
 * All Issues feed (SPEC §9.2): the first keyset page of every mirrored issue
 * matching the URL filter, plus the server total for the head count. Lives on
 * the layout so the feed is shared by `/issues` and the
 * `/issues/<owner>/<repo>/<n>` detail route (a child route does not run the
 * parent `+page.server.ts`).
 */
export const load: LayoutServerLoad = async ({ url, parent }) => {
  const { viewerExternalId } = await parent();
  const filter = parseIssueFilter(url.searchParams, filterContext(viewerExternalId));
  // Issues default to the open state, matching the cockpit's "what needs
  // attention" focus; `?state=closed` or `?state=open&state=closed` opt out.
  if (filter.states.length === 0) filter.states = ["open"];
  const issues: ListPage<IssueListItem> = allIssues(filter);
  return { issues };
};
