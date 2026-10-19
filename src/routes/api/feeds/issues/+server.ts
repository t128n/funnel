/**
 * Issues feed page (SPEC §9.2, plan T2).
 *
 * Thin HTTP shell over the keyset-paged local query service: parse the URL
 * filter, keep the cockpit's default `open` state, validate the cursor against
 * that filter, and return one {@link ListPage}. A cursor that is malformed or
 * was minted for a different filter is a client error (400), never a silent
 * restart at page one.
 */
import { getViewerGithubId } from "#lib/server/auth/index";
import { apiRole } from "#lib/server/http/session";
import { parseIssueFilter } from "#lib/server/issues/filters";
import {
  decodeCursor,
  filterSignature,
  type ListPage,
  type PageOptions,
} from "#lib/server/issues/pagination";
import { allIssues, filterContext } from "#lib/server/issues/queries";
import type { IssueListItem } from "#lib/server/issues/types";
import type { RequestHandler } from "./$types";

/** A 400 the route turns into a JSON error response. */
export class FeedRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedRequestError";
  }
}

/** `limit`/`cursor` passthrough; T1 clamps the limit to its hard cap. */
export function pageOptions(search: URLSearchParams): PageOptions {
  const rawLimit = search.get("limit");
  const cursor = search.get("cursor");
  return {
    limit: rawLimit === null ? undefined : Number(rawLimit),
    cursor: cursor ? cursor : null,
  };
}

/** Reject a cursor that does not decode for `signature`. */
export function requireCursor(
  cursor: string | null,
  signature: string,
): void {
  if (cursor && decodeCursor(cursor, signature) === null) {
    throw new FeedRequestError("Invalid cursor");
  }
}

/** One page of All Issues, defaulting to the open state like the cockpit. */
export function issuesPage(
  search: URLSearchParams,
  viewerGithubId: number | null,
): ListPage<IssueListItem> {
  const filter = parseIssueFilter(search, filterContext(viewerGithubId));
  if (filter.states.length === 0) filter.states = ["open"];
  const opts = pageOptions(search);
  requireCursor(opts.cursor ?? null, filterSignature(filter));
  return allIssues(filter, opts);
}

export const GET: RequestHandler = async ({ url, locals }) => {
  const userId = apiRole(locals, "read");
  if (userId instanceof Response) return userId;

  try {
    const viewerGithubId = await getViewerGithubId(userId);
    return Response.json(issuesPage(url.searchParams, viewerGithubId));
  } catch (error) {
    if (error instanceof FeedRequestError) {
      return Response.json({ message: error.message }, { status: 400 });
    }
    throw error;
  }
};
