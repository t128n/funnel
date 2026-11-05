import * as v from "valibot";
import type { RequestHandler } from "./$types";
import {
  authenticateWrite,
  issueNumberParam,
  readJson,
  scheduleRefresh,
} from "#lib/server/issues/http";
import { setCommentReaction } from "#lib/server/issues/mutations";
import { rememberViewerReaction } from "#lib/server/issues/reaction-state";
import { outcomeResponse } from "#lib/server/http/outcome";
import { REACTION_CONTENTS, isReactionContent } from "#lib/reactions";

function commentIdParam(value: string | undefined): number | Response {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ message: "Invalid comment id" }, { status: 400 });
  }
  return id;
}

const reactionSchema = v.object({
  content: v.picklist(REACTION_CONTENTS, "Unknown reaction"),
});

/**
 * Add one reaction to a comment with the signed-in user's token. `forges`
 * addresses reactions by content, so no reaction id is needed.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
  const auth = await authenticateWrite(locals);
  if (!auth.ok) return auth.response;

  const number = issueNumberParam(params.number);
  if (number instanceof Response) return number;
  const commentId = commentIdParam(params.commentId);
  if (commentId instanceof Response) return commentId;

  const read = await readJson(request);
  if (!read.ok) return read.response;

  const parsed = v.safeParse(reactionSchema, read.body);
  if (!parsed.success) {
    return Response.json(
      {
        message: "Invalid reaction",
        issues: parsed.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  const repo = `${params.owner}/${params.repo}`;
  const result = await setCommentReaction({
    provider: auth.provider,
    repo,
    number,
    commentId,
    content: parsed.output.content,
    active: true,
  });
  if (result.ok) {
    rememberViewerReaction(
      auth.userId,
      repo,
      String(commentId),
      parsed.output.content,
      true,
    );
    scheduleRefresh(params.owner, params.repo, number, locals.user?.id);
  }
  return outcomeResponse(result, 201);
};

/** Remove the signed-in user's reaction, addressed by `?content=<name>`. */
export const DELETE: RequestHandler = async ({ params, request, locals }) => {
  const auth = await authenticateWrite(locals);
  if (!auth.ok) return auth.response;

  const number = issueNumberParam(params.number);
  if (number instanceof Response) return number;
  const commentId = commentIdParam(params.commentId);
  if (commentId instanceof Response) return commentId;

  const content = new URL(request.url).searchParams.get("content");
  if (!isReactionContent(content)) {
    return Response.json({ message: "Invalid reaction" }, { status: 400 });
  }

  const repo = `${params.owner}/${params.repo}`;
  const result = await setCommentReaction({
    provider: auth.provider,
    repo,
    number,
    commentId,
    content,
    active: false,
  });
  if (result.ok) {
    rememberViewerReaction(auth.userId, repo, String(commentId), content, false);
    scheduleRefresh(params.owner, params.repo, number, locals.user?.id);
  }
  return outcomeResponse(result);
};
