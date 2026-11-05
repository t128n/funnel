import * as v from "valibot";
import type { RequestHandler } from "./$types";
import {
  authenticateWrite,
  issueNumberParam,
  readJson,
  scheduleRefresh,
} from "#lib/server/issues/http";
import {
  deleteIssueComment,
  updateIssueComment,
} from "#lib/server/issues/mutations";
import { outcomeResponse } from "#lib/server/http/outcome";

/** GitHub comment database ids are positive integers. */
function commentIdParam(value: string | undefined): number | Response {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ message: "Invalid comment id" }, { status: 400 });
  }
  return id;
}

const commentSchema = v.object({
  body: v.pipe(
    v.string("Comment must be a string"),
    v.trim(),
    v.nonEmpty("Comment must not be empty"),
    v.maxLength(65536),
  ),
});

/** Edit one of the signed-in user's comments (GitHub enforces authorship). */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const auth = await authenticateWrite(locals);
  if (!auth.ok) return auth.response;

  const number = issueNumberParam(params.number);
  if (number instanceof Response) return number;
  const commentId = commentIdParam(params.commentId);
  if (commentId instanceof Response) return commentId;

  const read = await readJson(request);
  if (!read.ok) return read.response;

  const parsed = v.safeParse(commentSchema, read.body);
  if (!parsed.success) {
    return Response.json(
      {
        message: "Invalid comment",
        issues: parsed.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  const result = await updateIssueComment({
    provider: auth.provider,
    repo: `${params.owner}/${params.repo}`,
    number,
    commentId,
    body: parsed.output.body,
  });
  if (result.ok) {
    scheduleRefresh(params.owner, params.repo, number, locals.user?.id);
  }
  return outcomeResponse(result);
};

/** Delete one of the signed-in user's comments (admins may delete any). */
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const auth = await authenticateWrite(locals);
  if (!auth.ok) return auth.response;

  const number = issueNumberParam(params.number);
  if (number instanceof Response) return number;
  const commentId = commentIdParam(params.commentId);
  if (commentId instanceof Response) return commentId;

  const result = await deleteIssueComment({
    provider: auth.provider,
    repo: `${params.owner}/${params.repo}`,
    number,
    commentId,
  });
  if (result.ok) {
    scheduleRefresh(params.owner, params.repo, number, locals.user?.id);
  }
  return outcomeResponse(result);
};
