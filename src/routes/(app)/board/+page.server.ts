import { parseIssueFilter } from "#lib/server/issues/filters";
import { filterContext, statusBoard } from "#lib/server/issues/queries";
import type { PageServerLoad } from "./$types";

/** The six-column board; Done is bounded by `board.done_days` (SPEC §9.3). */
export const load: PageServerLoad = async ({ url, parent }) => {
  const { viewerGithubId } = await parent();
  const filter = parseIssueFilter(url.searchParams, filterContext(viewerGithubId));
  const board = await statusBoard(filter);
  return { board };
};
