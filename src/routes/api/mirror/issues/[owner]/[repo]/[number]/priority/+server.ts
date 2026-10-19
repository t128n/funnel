import * as v from "valibot";
import type { RequestHandler } from "./$types";
import { apiRole } from "#lib/server/http/session";
import { readJson } from "#lib/server/issues/http";
import {
  getPriorityState,
  setPriorityInputs,
} from "#lib/server/issues/priority";
import { publish } from "#lib/server/sync/events";
import { getIssue, getRepoByOrgName } from "#lib/server/sync/mirror";

/**
 * Set the durable impact/urgency axes for one issue and return the derived
 * priority. This is Funnel-local state, not a GitHub write: the retired
 * `p1`–`p3` labels are never touched.
 */
const updateSchema = v.object({
  impact: v.optional(v.nullable(v.picklist([1, 2, 3, 4] as const))),
  urgency: v.optional(v.nullable(v.picklist([1, 2, 3, 4] as const))),
});

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const denied = apiRole(locals, "write");
  if (denied instanceof Response) return denied;

  const repo = getRepoByOrgName(params.owner, params.repo);
  if (!repo) {
    return Response.json(
      {
        message: `Repository ${params.owner}/${params.repo} is not mirrored`,
      },
      { status: 404 },
    );
  }

  const number = Number(params.number);
  if (!Number.isInteger(number) || number <= 0) {
    return Response.json({ message: "Invalid issue number" }, { status: 400 });
  }
  if (!getIssue(repo.githubId, number)) {
    return Response.json(
      { message: `Issue ${params.owner}/${params.repo}#${number} is not mirrored` },
      { status: 404 },
    );
  }

  const read = await readJson(request);
  if (!read.ok) return read.response;

  const parsed = v.safeParse(updateSchema, read.body);
  if (!parsed.success) {
    return Response.json(
      {
        message: "Invalid priority inputs",
        issues: parsed.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  if (
    parsed.output.impact === undefined &&
    parsed.output.urgency === undefined
  ) {
    return Response.json(
      { message: "Provide impact and/or urgency" },
      { status: 400 },
    );
  }

  const current = getPriorityState(repo.org, repo.name, number);
  const state = setPriorityInputs(repo.org, repo.name, number, {
    impact:
      parsed.output.impact === undefined
        ? (current?.impact ?? null)
        : parsed.output.impact,
    urgency:
      parsed.output.urgency === undefined
        ? (current?.urgency ?? null)
        : parsed.output.urgency,
  });

  publish({
    type: "issues",
    repo: `${repo.org}/${repo.name}`,
    numbers: [number],
  });
  return Response.json(state);
};
