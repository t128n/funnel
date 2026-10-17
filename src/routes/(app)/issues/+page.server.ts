import { parseIssueFilter } from "#lib/server/issues/filters";
import { allIssues, filterContext } from "#lib/server/issues/queries";
import type { PageServerLoad } from "./$types";

/** All Issues: every mirrored issue matching the URL filter (SPEC §9.2). */
export const load: PageServerLoad = async ({ url, parent }) => {
  const { viewerGithubId } = await parent();
  const filter = parseIssueFilter(url.searchParams, filterContext(viewerGithubId));
  return { issues: allIssues(filter) };
};
