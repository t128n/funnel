import * as v from "valibot";
import type { RequestHandler } from "./$types";
import { installationErrorResponse } from "#lib/server/github/app.server";
import {
  passthrough,
  toResponse,
} from "#lib/server/github/api-passthrough.server";
import { forge } from "#lib/server/forge/providers.server";
import {
  PRIORITY_VALUES,
  SIZE_VALUES,
  STATUS_VALUES,
} from "#lib/server/issues/filters";
import { authenticate, readJson, scheduleRefresh } from "#lib/server/issues/http";
import { apiRole } from "#lib/server/http/session";
import { updateIssue } from "#lib/server/issues/mutations";
import { outcomeResponse } from "#lib/server/http/outcome";

/** Mirrors `GET /repos/{owner}/{repo}/issues/{number}`. */
export const GET: RequestHandler = async ({ params, request, locals }) => {
  const denied = apiRole(locals, "read");
  if (denied instanceof Response) return denied;

  let installationId: number;
  try {
    installationId = await forge.getInstallationId(params.owner, params.repo);
  } catch (e) {
    return installationErrorResponse(params.owner, params.repo, e);
  }
  const result = await passthrough(
    await forge.installationProvider(installationId),
    installationId,
    `/repos/${params.owner}/${params.repo}/issues/${params.number}`,
    new URLSearchParams(),
    request.headers.get("if-none-match"),
    {
      htmlUrlFallback: await forge.webUrl(
        `${params.owner}/${params.repo}/issues/${params.number}`,
      ),
    },
  );
  return toResponse(result);
};

/**
 * Update an issue with the signed-in user's token (SPEC §9.2): title/body and
 * assignees, open/closed state, and the reserved status/priority/size labels.
 */
const updateSchema = v.object({
  title: v.optional(
    v.pipe(
      v.string("Title must be a string"),
      v.trim(),
      v.nonEmpty("Title must not be empty"),
      v.maxLength(256, "Title must be at most 256 characters"),
    ),
  ),
  body: v.optional(v.pipe(v.string(), v.maxLength(65536))),
  assignees: v.optional(v.array(v.pipe(v.string(), v.trim(), v.nonEmpty()))),
  state: v.optional(v.picklist(["open", "closed"] as const)),
  state_reason: v.optional(
    v.nullable(v.picklist(["completed", "not_planned"] as const)),
  ),
  status: v.optional(v.nullable(v.picklist(STATUS_VALUES))),
  priority: v.optional(v.nullable(v.picklist(PRIORITY_VALUES))),
  size: v.optional(v.nullable(v.picklist(SIZE_VALUES))),
  blocked: v.optional(v.boolean()),
  milestone: v.optional(
    v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
  ),
});

export const PATCH: RequestHandler = async ({
  params,
  request,
  locals,
}) => {
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

  const parsed = v.safeParse(updateSchema, read.body);
  if (!parsed.success) {
    return Response.json(
      {
        message: "Invalid update",
        issues: parsed.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  const result = await updateIssue({
    provider: auth.provider,
    repo: `${params.owner}/${params.repo}`,
    number,
    title: parsed.output.title,
    body: parsed.output.body,
    assignees: parsed.output.assignees,
    state: parsed.output.state,
    stateReason: parsed.output.state_reason,
    status: parsed.output.status,
    priority: parsed.output.priority,
    size: parsed.output.size,
    blocked: parsed.output.blocked,
    milestone: parsed.output.milestone,
  });
  if (result.ok) scheduleRefresh(params.owner, params.repo, number);
  return outcomeResponse(result);
};
