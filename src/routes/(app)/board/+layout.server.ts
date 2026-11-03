import { parseIssueFilter } from "#lib/server/issues/filters";
import { filterContext, statusBoard } from "#lib/server/issues/queries";
import type { PagedStatusBoard } from "#lib/server/issues/pagination";
import type { LayoutServerLoad } from "./$types";

/**
 * The five-column board (Backlog..In Review plus Done); Done is bounded by
 * `board.done_days` (SPEC §9.3). Blocking is an orthogonal card flag, not a
 * column. The layout owns the load so `/board` is the single page that reads
 * it; the legacy `/board/<owner>/<repo>/<n>` route redirects to the issue page.
 *
 * Each lane is the first page of its own keyset feed: `total`/`nextCursor` come
 * from the server, so WIP counts never depend on which cards are loaded.
 */
export const load: LayoutServerLoad = async ({ url, parent }) => {
  const { viewerExternalId, viewerGithub, repoShortcodes } = await parent();
  const filter = parseIssueFilter(
    url.searchParams,
    filterContext(viewerExternalId),
  );
  const board: PagedStatusBoard = await statusBoard(filter);
  return { board, repoShortcodes, viewerGithub };
};
