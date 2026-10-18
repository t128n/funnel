import { parseIssueFilter } from "#lib/server/issues/filters";
import { allIssues, filterContext } from "#lib/server/issues/queries";
import type { LayoutServerLoad } from "./$types";

/**
 * All Issues feed (SPEC §9.2): every mirrored issue matching the URL filter.
 * Lives on the layout so the feed is shared by `/issues` and the
 * `/issues/<owner>/<repo>/<n>` detail route (a child route does not run the
 * parent `+page.server.ts`).
 */
export const load: LayoutServerLoad = async ({ url, parent }) => {
  const { viewerGithubId } = await parent();
  const filter = parseIssueFilter(url.searchParams, filterContext(viewerGithubId));
  // Issues default to the open state, matching the cockpit's "what needs
  // attention" focus; `?state=closed` or `?state=open&state=closed` opt out.
  if (filter.states.length === 0) filter.states = ["open"];
  return { issues: allIssues(filter) };
};
