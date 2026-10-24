import * as v from "valibot";
import type { RequestHandler } from "./$types";
import { createManualDelay } from "#lib/server/actuals/store";
import { DELAY_REASONS } from "#lib/server/actuals/reasons";
import { parseTimestamp } from "#lib/server/actuals/time";
import { apiRole } from "#lib/server/http/session";
import { issueNumberParam, readJson } from "#lib/server/issues/http";
import { publish } from "#lib/server/sync/events";
import { getRepoByOrgName } from "#lib/server/sync/mirror";

/**
 * Create a manual delay on an issue (SPEC §2, §7).
 *
 * Delays are Funnel-local durable state; the write needs a `write` session but
 * no forge token. Timestamps accept unix milliseconds or an ISO 8601 string.
 */
const timestamp = v.pipe(
  v.union([v.number(), v.string()]),
  v.check(
    (value) => parseTimestamp(value) !== null,
    "Timestamp must be ISO 8601 or unix milliseconds",
  ),
  v.transform((value) => parseTimestamp(value) as number),
);

const createSchema = v.object({
  reason: v.picklist(DELAY_REASONS),
  started_at: v.optional(timestamp),
  ended_at: v.optional(timestamp),
  note: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(4000))),
});

function invalidDelay(issues: string[]): Response {
  return Response.json({ message: "Invalid delay", issues }, { status: 400 });
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const denied = apiRole(locals, "write");
  if (denied instanceof Response) return denied;

  const number = issueNumberParam(params.number);
  if (number instanceof Response) return number;
  if (!getRepoByOrgName(params.owner, params.repo)) {
    return Response.json(
      {
        message: `Repository ${params.owner}/${params.repo} is not mirrored`,
      },
      { status: 404 },
    );
  }

  const read = await readJson(request);
  if (!read.ok) return read.response;

  const parsed = v.safeParse(createSchema, read.body);
  if (!parsed.success) {
    return invalidDelay(parsed.issues.map((issue) => issue.message));
  }

  const startedAt = parsed.output.started_at ?? Date.now();
  const endedAt = parsed.output.ended_at ?? null;
  if (endedAt !== null && endedAt < startedAt) {
    return invalidDelay(["ended_at must not precede started_at"]);
  }

  const delay = createManualDelay({
    org: params.owner,
    name: params.repo,
    issueNumber: number,
    reason: parsed.output.reason,
    startedAt,
    endedAt,
    note: parsed.output.note ?? "",
  });

  publish({
    type: "issues",
    repo: `${params.owner}/${params.repo}`,
    numbers: [number],
  });
  return Response.json(delay, { status: 201 });
};
