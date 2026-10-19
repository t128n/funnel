/**
 * Inbox feed page (SPEC §6, §9.2, plan T2).
 *
 * Pages the untriaged-issue half of the queue while always returning the
 * pending intake submissions first; submission bodies are anonymous,
 * untrusted Markdown, so they are rendered to sanitized HTML at this delivery
 * boundary (SPEC §2.2) exactly as the Inbox layout does.
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
import { filterContext, inbox } from "#lib/server/issues/queries";
import type {
  InboxEntry,
  RenderedInboxEntry,
} from "#lib/server/issues/types";
import { renderMarkdown } from "#lib/server/markdown/render";
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
export function requireCursor(cursor: string | null, signature: string): void {
  if (cursor && decodeCursor(cursor, signature) === null) {
    throw new FeedRequestError("Invalid cursor");
  }
}

/** Attach sanitized HTML to a submission entry (SPEC §2.2). */
function renderEntry(entry: InboxEntry): RenderedInboxEntry {
  if (entry.kind !== "submission") return entry;
  return {
    kind: "submission",
    submission: {
      ...entry.submission,
      bodyHtml: renderMarkdown(entry.submission.body),
    },
  };
}

/** One page of the Inbox: submissions first, then untriaged issues. */
export function inboxPage(
  search: URLSearchParams,
  viewerGithubId: number | null,
): ListPage<RenderedInboxEntry> {
  const filter = parseIssueFilter(search, filterContext(viewerGithubId));
  const opts = pageOptions(search);
  // Must match `inbox()`'s signature, including its `inbox` discriminator.
  requireCursor(opts.cursor ?? null, filterSignature(filter, "inbox"));
  const page = inbox(filter, opts);
  return { ...page, items: page.items.map(renderEntry) };
}

export const GET: RequestHandler = async ({ url, locals }) => {
  const userId = apiRole(locals, "read");
  if (userId instanceof Response) return userId;

  try {
    const viewerGithubId = await getViewerGithubId(userId);
    return Response.json(inboxPage(url.searchParams, viewerGithubId));
  } catch (error) {
    if (error instanceof FeedRequestError) {
      return Response.json({ message: error.message }, { status: 400 });
    }
    throw error;
  }
};
