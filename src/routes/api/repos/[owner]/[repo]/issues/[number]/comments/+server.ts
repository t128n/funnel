import * as v from "valibot";
import type { RequestHandler } from "./$types";
import { repoGet } from "#lib/server/github/app.server";
import {
  authenticateWrite,
  issueNumberParam,
  readJson,
  scheduleRefresh,
} from "#lib/server/issues/http";
import { addIssueComment } from "#lib/server/issues/mutations";
import { apiRole } from "#lib/server/http/session";
import { outcomeResponse } from "#lib/server/http/outcome";

/** Mirrors `GET /repos/{owner}/{repo}/issues/{number}/comments`. */
const ALLOWED = new Set(["since", "per_page", "page"]);

export const GET: RequestHandler = async ({ params, request, locals }) => {
  const denied = apiRole(locals, "read");
  if (denied instanceof Response) return denied;

  return repoGet(
    params,
    request,
    `/repos/${params.owner}/${params.repo}/issues/${params.number}/comments`,
    {
      query: ALLOWED,
      fallbackPath: `${params.owner}/${params.repo}/issues/${params.number}`,
    },
  );
};

/** Post a comment with the signed-in user's token (SPEC §9.2). */
const commentSchema = v.object({
  body: v.pipe(
    v.string("Comment must be a string"),
    v.trim(),
    v.nonEmpty("Comment must not be empty"),
    v.maxLength(65536),
  ),
});

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const auth = await authenticateWrite(locals);
  if (!auth.ok) return auth.response;

  const number = issueNumberParam(params.number);
  if (number instanceof Response) return number;

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

  const result = await addIssueComment({
    provider: auth.provider,
    repo: `${params.owner}/${params.repo}`,
    number,
    body: parsed.output.body,
  });
  if (result.ok) {
    scheduleRefresh(params.owner, params.repo, number, locals.user?.id);
  }
  return outcomeResponse(result, 201);
};
