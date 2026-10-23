/**
 * Status-board lane feed (SPEC §9.3, plan T2).
 *
 * One HTTP page per lane, selected by `?column=` (`backlog`..`in-review` plus
 * the bounded `done` window). Totals and cursors come from the server, so a
 * lane's WIP count never depends on which cards the client has loaded.
 */
import { getViewerExternalId } from "#lib/server/auth/index";
import { apiRole } from "#lib/server/http/session";
import { parseIssueFilter, STATUS_VALUES } from "#lib/server/issues/filters";
import {
  FeedRequestError,
  filterSignature,
  pageOptions,
  requireCursor,
  type ListPage,
} from "#lib/server/issues/pagination";
import { boardColumnPage, filterContext } from "#lib/server/issues/queries";
import type { IssueListItem, StatusKey } from "#lib/server/issues/types";
import type { RequestHandler } from "./$types";

const BOARD_COLUMNS: readonly string[] = [...STATUS_VALUES, "done"];

function isStatusKey(value: string): value is StatusKey {
  return BOARD_COLUMNS.includes(value);
}

/** One page of a single board lane, chosen by `?column=`. */
async function boardPage(
  search: URLSearchParams,
  viewerExternalId: string | null,
): Promise<ListPage<IssueListItem>> {
  const column = search.get("column") ?? "";
  if (!isStatusKey(column)) throw new FeedRequestError("Unknown column");

  const filter = parseIssueFilter(search, filterContext(viewerExternalId));
  const opts = pageOptions(search);
  requireCursor(
    opts.cursor ?? null,
    filterSignature({ ...filter, statuses: [] }, `board:${column}`),
  );
  return boardColumnPage(filter, column, opts);
}

export const GET: RequestHandler = async ({ url, locals }) => {
  const userId = apiRole(locals, "read");
  if (userId instanceof Response) return userId;

  try {
    const viewerExternalId = await getViewerExternalId(userId);
    return Response.json(await boardPage(url.searchParams, viewerExternalId));
  } catch (error) {
    if (error instanceof FeedRequestError) {
      return Response.json({ message: error.message }, { status: 400 });
    }
    throw error;
  }
};
