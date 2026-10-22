import * as v from "valibot";
import type { RequestHandler } from "./$types";
import {
  getInstallationId,
  github,
  installationErrorResponse,
  webUrl,
} from "#lib/server/github/app.server";
import {
  passthrough,
  toResponse,
} from "#lib/server/github/api-passthrough.server";
import { authenticate, readJson, scheduleRefresh } from "#lib/server/issues/http";
import { addIssueComment } from "#lib/server/issues/mutations";
import { apiRole } from "#lib/server/http/session";
import { outcomeResponse } from "#lib/server/http/outcome";

/** Mirrors `GET /repos/{owner}/{repo}/issues/{number}/comments`. */
const ALLOWED = new Set(["since", "per_page", "page"]);

export const GET: RequestHandler = async ({ params, url, request, locals }) => {
  const denied = apiRole(locals, "read");
  if (denied instanceof Response) return denied;

  let installationId: number;
  try {
    installationId = await getInstallationId(params.owner, params.repo);
  } catch (e) {
    return installationErrorResponse(params.owner, params.repo, e);
  }
  const query = new URLSearchParams();
  for (const [k, v] of url.searchParams) {
    if (ALLOWED.has(k)) query.append(k, v);
  }
  const result = await passthrough(
    await github.asInstallation(installationId),
    installationId,
    `/repos/${params.owner}/${params.repo}/issues/${params.number}/comments`,
    query,
    request.headers.get("if-none-match"),
    {
      htmlUrlFallback: await webUrl(
        `${params.owner}/${params.repo}/issues/${params.number}`,
      ),
    },
  );
  return toResponse(result);
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
  const denied = apiRole(locals, "write");
  if (denied instanceof Response) return denied;

  const auth = await authenticate(locals.user?.id);
  if (!auth.ok) return auth.response;

  const number = Number(params.number);
  if (!Number.isInteger(number) || number <= 0) {
    return Response.json({ message: "Invalid issue number" }, { status: 400 });
  }

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
  if (result.ok) scheduleRefresh(params.owner, params.repo, number);
  return outcomeResponse(result, 201);
};
