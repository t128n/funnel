import { parseIssueFilter } from "#lib/server/issues/filters";
import { allIssues, filterContext } from "#lib/server/issues/queries";
import type { PageServerLoad } from "./$types";

/** All Issues: every mirrored issue matching the URL filter (SPEC §9.2). */
export const load: PageServerLoad = async ({ url, parent }) => {
  const { viewerGithubId } = await parent();
  const filter = parseIssueFilter(url.searchParams, filterContext(viewerGithubId));
  // Issues default to the open state, matching the cockpit's "what needs
  // attention" focus; `?state=closed` or `?state=open&state=closed` opt out.
  if (filter.states.length === 0) filter.states = ["open"];
  return { issues: allIssues(filter) };
};
