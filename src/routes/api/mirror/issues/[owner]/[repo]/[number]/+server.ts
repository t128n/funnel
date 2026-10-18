import { getIssueDetail } from "#lib/server/issues/queries";
import type { RenderedIssueDetail } from "#lib/server/issues/types";
import { renderMarkdown } from "#lib/server/markdown/render";
import { getRepoByOrgName } from "#lib/server/sync/mirror";
import type { RequestHandler } from "./$types";

/**
 * Read-only Inspector payload straight from the local mirror (SPEC §1.4).
 *
 * No network, no auth token: this is the same disposable cache the streams read
 * from. Kept ungated to match the other mirror-backed read routes (the cockpit
 * pages themselves are session-gated; SPEC §8 assumes an enterprise network).
 */
export const GET: RequestHandler = ({ params }) => {
  const repo = getRepoByOrgName(params.owner, params.repo);
  if (!repo) {
    return Response.json(
      { message: `Repository ${params.owner}/${params.repo} is not mirrored` },
      { status: 404 },
    );
  }

  const number = Number(params.number);
  if (!Number.isInteger(number) || number <= 0) {
    return Response.json({ message: "Invalid issue number" }, { status: 400 });
  }

  const detail = getIssueDetail(repo.githubId, number);
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
    bodyHtml: renderMarkdown(detail.body),
    comments: detail.comments.map((comment) => ({
      ...comment,
      bodyHtml: renderMarkdown(comment.body),
    })),
  };
  return Response.json(payload);
};
