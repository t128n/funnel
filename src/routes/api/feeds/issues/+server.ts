/**
 * Issues feed page (SPEC §9.2, plan T2).
 *
 * Thin HTTP shell over the keyset-paged local query service: parse the URL
 * filter, keep the cockpit's default `open` state, validate the cursor against
 * that filter, and return one {@link ListPage}. A cursor that is malformed or
 * was minted for a different filter is a client error (400), never a silent
 * restart at page one.
 */
import { getViewerExternalId } from "#lib/server/auth/index";
import { apiRole } from "#lib/server/http/session";
import { parseIssueFilter } from "#lib/server/issues/filters";
import {
  FeedRequestError,
  filterSignature,
  pageOptions,
  requireCursor,
  type ListPage,
} from "#lib/server/issues/pagination";
import { allIssues, filterContext } from "#lib/server/issues/queries";
import type { IssueListItem } from "#lib/server/issues/types";
import type { RequestHandler } from "./$types";

/** One page of All Issues, defaulting to the open state like the cockpit. */
function issuesPage(
  search: URLSearchParams,
  viewerExternalId: string | null,
): ListPage<IssueListItem> {
  const filter = parseIssueFilter(search, filterContext(viewerExternalId));
  if (filter.states.length === 0) filter.states = ["open"];
  const opts = pageOptions(search);
  requireCursor(opts.cursor ?? null, filterSignature(filter));
  return allIssues(filter, opts);
}

export const GET: RequestHandler = async ({ url, locals }) => {
  const userId = apiRole(locals, "read");
  if (userId instanceof Response) return userId;

  try {
    const viewerExternalId = await getViewerExternalId(userId);
    return Response.json(issuesPage(url.searchParams, viewerExternalId));
  } catch (error) {
    if (error instanceof FeedRequestError) {
      return Response.json({ message: error.message }, { status: 400 });
    }
    throw error;
  }
};
