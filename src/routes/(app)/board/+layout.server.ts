import { parseIssueFilter } from "#lib/server/issues/filters";
import { filterContext, statusBoard } from "#lib/server/issues/queries";
import type { LayoutServerLoad } from "./$types";

/**
 * The six-column board; Done is bounded by `board.done_days` (SPEC §9.3).
 * Lives on the layout so the board grid is shared by `/board` and the
 * `/board/<owner>/<repo>/<n>` detail route.
 */
export const load: LayoutServerLoad = async ({ url, parent }) => {
  const { viewerGithubId } = await parent();
  const filter = parseIssueFilter(url.searchParams, filterContext(viewerGithubId));
  const board = await statusBoard(filter);
  return { board };
};
