import * as v from "valibot";
import type { RequestHandler } from "./$types";
import {
  deleteDelay,
  delayTarget,
  updateDelay,
  type DelayTarget,
} from "#lib/server/actuals/store";
import { DELAY_REASONS } from "#lib/server/actuals/reasons";
import { parseTimestamp } from "#lib/server/actuals/time";
import { apiRole } from "#lib/server/http/session";
import { issueNumberParam, readJson } from "#lib/server/issues/http";
import { publish } from "#lib/server/sync/events";

/**
 * Edit or delete a manual delay (SPEC §2, §7). Automatic (`blocked`) delays are
 * read-only because they follow the issue's blocked flag; only rows created
 * here may be changed. Successful writes publish an `issues` event.
 */
const timestamp = v.pipe(
  v.union([v.number(), v.string()]),
  v.check(
    (value) => parseTimestamp(value) !== null,
    "Timestamp must be ISO 8601 or unix milliseconds",
  ),
  v.transform((value) => parseTimestamp(value) as number),
);

const patchSchema = v.object({
  reason: v.optional(v.picklist(DELAY_REASONS)),
  ended_at: v.optional(v.nullable(timestamp)),
  note: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(4000))),
});

function invalidDelay(issues: string[]): Response {
  return Response.json({ message: "Invalid delay", issues }, { status: 400 });
}

function notFound(): Response {
  return Response.json({ message: "Delay not found" }, { status: 404 });
}

/**
 * Resolve a delay owned by the issue in the URL. A delay from another issue is
 * indistinguishable from a missing one.
 */
function resolveTarget(
  params: { owner: string; repo: string; number: string; id: string },
):
  | { ok: true; target: DelayTarget }
  | { ok: false; response: Response } {
  const number = issueNumberParam(params.number);
  if (number instanceof Response) return { ok: false, response: number };
  const target = delayTarget(params.id);
  if (
    !target ||
    target.org !== params.owner ||
    target.name !== params.repo ||
    target.issueNumber !== number
  ) {
    return { ok: false, response: notFound() };
  }
  return { ok: true, target };
}

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const denied = apiRole(locals, "write");
  if (denied instanceof Response) return denied;

  const resolved = resolveTarget(params);
  if (!resolved.ok) return resolved.response;
  const { target } = resolved;
  if (target.source !== "manual") {
    return Response.json(
      { message: "Automatic delays are read-only" },
      { status: 403 },
    );
  }

  const read = await readJson(request);
  if (!read.ok) return read.response;
  const parsed = v.safeParse(patchSchema, read.body);
  if (!parsed.success) {
    return invalidDelay(parsed.issues.map((issue) => issue.message));
  }

  const endedAt =
    parsed.output.ended_at === undefined ? undefined : parsed.output.ended_at;
  if (endedAt !== undefined && endedAt !== null && endedAt < target.startedAt) {
    return invalidDelay(["ended_at must not precede started_at"]);
  }

  const delay = updateDelay(params.id, {
    reason: parsed.output.reason,
    endedAt,
    note: parsed.output.note,
  });
  if (!delay) return notFound();

  publish({
    type: "issues",
    repo: `${target.org}/${target.name}`,
    numbers: [target.issueNumber],
  });
  return Response.json(delay);
};

export const DELETE: RequestHandler = ({ params, locals }) => {
  const denied = apiRole(locals, "write");
  if (denied instanceof Response) return denied;

  const resolved = resolveTarget(params);
  if (!resolved.ok) return resolved.response;
  const { target } = resolved;
  if (target.source !== "manual") {
    return Response.json(
      { message: "Automatic delays are read-only" },
      { status: 403 },
    );
  }

  if (!deleteDelay(params.id)) return notFound();

  publish({
    type: "issues",
    repo: `${target.org}/${target.name}`,
    numbers: [target.issueNumber],
  });
  return new Response(null, { status: 204 });
};
