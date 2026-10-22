import * as v from "valibot";
import type { RequestHandler } from "./$types";
import {
  getInstallationId,
  github,
  installationErrorResponse,
} from "#lib/server/github/app.server";
import {
  passthrough,
  toResponse,
} from "#lib/server/github/api-passthrough.server";
import {
  PRIORITY_VALUES,
  SIZE_VALUES,
  STATUS_VALUES,
} from "#lib/server/issues/filters";
import { authenticate, readJson, scheduleRefresh } from "#lib/server/issues/http";
import { apiRole } from "#lib/server/http/session";
import { createIssue } from "#lib/server/issues/mutations";
import { outcomeResponse } from "#lib/server/http/outcome";

/** Mirrors `GET /repos/{owner}/{repo}/issues`. Entries with a
 * `pull_request` key are dropped. Unknown query params are ignored,
 * like GitHub. */
const ALLOWED = new Set([
  "state",
  "labels",
  "assignee",
  "creator",
  "mentioned",
  "milestone",
  "since",
  "sort",
  "direction",
  "per_page",
  "page",
]);

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
    `/repos/${params.owner}/${params.repo}/issues`,
    query,
    request.headers.get("if-none-match"),
    { filterPullRequests: true },
  );
  return toResponse(result);
};

/** Create an issue with the signed-in user's token (SPEC §9.2). */
const createSchema = v.object({
  title: v.pipe(
    v.string("Title must be a string"),
    v.trim(),
    v.nonEmpty("Title is required"),
    v.maxLength(256, "Title must be at most 256 characters"),
  ),
  body: v.optional(v.pipe(v.string(), v.maxLength(65536)), ""),
  labels: v.optional(
    v.array(v.pipe(v.string(), v.trim(), v.nonEmpty())),
    [],
  ),
  assignees: v.optional(
    v.array(v.pipe(v.string(), v.trim(), v.nonEmpty())),
    [],
  ),
  status: v.optional(v.picklist(STATUS_VALUES)),
  priority: v.optional(v.picklist(PRIORITY_VALUES)),
  size: v.optional(v.picklist(SIZE_VALUES)),
});

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const denied = apiRole(locals, "write");
  if (denied instanceof Response) return denied;

  const auth = await authenticate(locals.user?.id);
  if (!auth.ok) return auth.response;

  const read = await readJson(request);
  if (!read.ok) return read.response;

  const parsed = v.safeParse(createSchema, read.body);
  if (!parsed.success) {
    return Response.json(
      {
        message: "Invalid issue",
        issues: parsed.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  const result = await createIssue({
    provider: auth.provider,
    repo: `${params.owner}/${params.repo}`,
    ...parsed.output,
  });
  if (result.ok) {
    scheduleRefresh(params.owner, params.repo, result.value.number);
  }
  return outcomeResponse(result, 201);
};
