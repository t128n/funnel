/**
 * Scheduling endpoint (SPEC §7).
 *
 * `PUT` schedules one mirrored issue to one Monday week and `DELETE` clears the
 * plan item. Both require `write`; the schedule mutation enforces the hard cap.
 * Successful writes publish a `planning` event so open plan views refresh.
 */
import * as v from "valibot";
import type { RequestHandler } from "./$types";
import { apiRole } from "#lib/server/http/session";
import { issueNumberParam, readJson } from "#lib/server/issues/http";
import { getPlanItem } from "#lib/server/planning/store";
import { scheduleIssue, unscheduleIssue } from "#lib/server/planning/mutations";
import { publish } from "#lib/server/sync/events";

/** The only accepted field; Monday validation lives in the mutation. */
const scheduleSchema = v.object({
  week_start: v.pipe(
    v.string("week_start must be a string"),
    v.regex(/^\d{4}-\d{2}-\d{2}$/, "week_start must be YYYY-MM-DD"),
  ),
});

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const denied = apiRole(locals, "write");
  if (denied instanceof Response) return denied;

  const number = issueNumberParam(params.number);
  if (number instanceof Response) return number;

  const read = await readJson(request);
  if (!read.ok) return read.response;

  const parsed = v.safeParse(scheduleSchema, read.body);
  if (!parsed.success) {
    return Response.json(
      {
        message: "Invalid plan request",
        issues: parsed.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  const result = scheduleIssue({
    org: params.owner,
    name: params.repo,
    issueNumber: number,
    weekStart: parsed.output.week_start,
  });

  if (!result.ok) {
    return Response.json(
      {
        message: result.message,
        ...(result.violations === undefined
          ? {}
          : { violations: result.violations }),
      },
      { status: result.status },
    );
  }

  publish({ type: "planning" });
  return Response.json({
    item: getPlanItem(params.owner, params.repo, number) ?? null,
  });
};

export const DELETE: RequestHandler = ({ params, locals }) => {
  const denied = apiRole(locals, "write");
  if (denied instanceof Response) return denied;

  const number = issueNumberParam(params.number);
  if (number instanceof Response) return number;

  unscheduleIssue({
    org: params.owner,
    name: params.repo,
    issueNumber: number,
  });
  publish({ type: "planning" });
  return Response.json({ cleared: true });
};
