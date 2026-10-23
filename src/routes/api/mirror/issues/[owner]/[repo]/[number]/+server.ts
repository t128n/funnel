import { issueNumberParam } from "#lib/server/issues/http";
import { getIssueDetail } from "#lib/server/issues/queries";
import type { RenderedIssueDetail } from "#lib/server/issues/types";
import { apiRole } from "#lib/server/http/session";
import { renderMarkdown } from "#lib/server/markdown/render";
import { isWatching } from "#lib/server/notifications/service";
import { getRepoByOrgName } from "#lib/server/sync/mirror";
import type { RequestHandler } from "./$types";

/**
 * Read-only Inspector payload straight from the local mirror (SPEC §1.4).
 *
 * No network, no auth token: this is the same disposable cache the streams read
 * from. Requires a signed-in `read` session, like every other cockpit read.
 */
export const GET: RequestHandler = ({ params, locals }) => {
  const userId = apiRole(locals, "read");
  if (userId instanceof Response) return userId;

  const repo = getRepoByOrgName(params.owner, params.repo);
  if (!repo) {
    return Response.json(
      { message: `Repository ${params.owner}/${params.repo} is not mirrored` },
      { status: 404 },
    );
  }

  const number = issueNumberParam(params.number);
  if (number instanceof Response) return number;

  const detail = getIssueDetail(repo.id, number);
  if (!detail) {
    return Response.json(
      {
        message: `Issue ${params.owner}/${params.repo}#${number} is not mirrored`,
      },
      { status: 404 },
    );
  }

  // Render untrusted Markdown to sanitized HTML at the delivery boundary; the
  // raw body is preserved for the Inspector's inline editors (SPEC §2.2).
  const payload: RenderedIssueDetail = {
    ...detail,
    watching: isWatching(userId, repo.org, repo.name, number),
    bodyHtml: renderMarkdown(detail.body),
    comments: detail.comments.map((comment) => ({
      ...comment,
      bodyHtml: renderMarkdown(comment.body),
    })),
    workNotes: detail.workNotes.map((note) => ({
      ...note,
      bodyHtml: renderMarkdown(note.body),
    })),
  };
  return Response.json(payload);
};
