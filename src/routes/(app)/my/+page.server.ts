import { parseIssueFilter } from "#lib/server/issues/filters";
import { filterContext, myIssues } from "#lib/server/issues/queries";
import type { PageServerLoad } from "./$types";

/** My Issues: All Issues restricted to the viewer (SPEC §9.2). */
export const load: PageServerLoad = async ({ url, parent }) => {
  const { viewerGithubId } = await parent();
  const filter = parseIssueFilter(url.searchParams, filterContext(viewerGithubId));
  return { issues: myIssues(filter, viewerGithubId) };
};
