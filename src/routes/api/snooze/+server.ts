/**
 * Inbox snooze API (Funnel-local state only).
 *
 * A snooze hides a staged submission or an untriaged issue from the pending
 * Inbox until a resurface time; it never touches GitHub or the mirror. Any
 * `write` session may snooze, matching the local-only dismiss path.
 *
 * `POST` sets or replaces a snooze; `DELETE` clears it immediately. Both
 * publish an intake event so open cockpits refresh the queue and its badge.
 */
import * as v from "valibot";
import type { RequestHandler } from "./$types";
import { apiRole } from "#lib/server/http/session";
import { outcomeResponse } from "#lib/server/http/outcome";
import {
  clearIssueSnooze,
  clearSubmissionSnooze,
  snoozeIssue,
  snoozeSubmission,
} from "#lib/server/snooze";
import { publish } from "#lib/server/sync/events";

const targetSchema = v.variant("kind", [
  v.object({
    kind: v.literal("submission"),
    id: v.pipe(v.string(), v.trim(), v.nonEmpty("Missing submission id")),
    until: v.number(),
  }),
  v.object({
    kind: v.literal("issue"),
    repo: v.pipe(v.string(), v.trim(), v.nonEmpty("Missing repository")),
    number: v.pipe(v.number(), v.integer(), v.minValue(1)),
    until: v.number(),
  }),
]);

export const POST: RequestHandler = async ({ request, locals }) => {
  const userId = apiRole(locals, "write");
  if (userId instanceof Response) return userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = v.safeParse(targetSchema, body);
  if (!parsed.success) {
    return Response.json(
      {
        message: "Invalid snooze request",
        issues: parsed.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  const target = parsed.output;
  const result =
    target.kind === "submission"
      ? snoozeSubmission(target.id, target.until, userId)
      : snoozeIssue(target.repo, target.number, target.until, userId);

  if (result.ok) {
    publish({
      type: "intake",
      action: "snoozed",
      kind: target.kind,
      id: target.kind === "submission" ? target.id : undefined,
      repo: target.kind === "issue" ? target.repo : undefined,
      number: target.kind === "issue" ? target.number : undefined,
    });
  }
  return outcomeResponse(result);
};

export const DELETE: RequestHandler = ({ url, locals }) => {
  const userId = apiRole(locals, "write");
  if (userId instanceof Response) return userId;

  const kind = url.searchParams.get("kind");
  let cleared = false;
  if (kind === "submission") {
    const id = url.searchParams.get("id") ?? "";
    if (id.trim().length === 0) {
      return Response.json({ message: "Missing submission id" }, { status: 400 });
    }
    cleared = clearSubmissionSnooze(id);
  } else if (kind === "issue") {
    const repo = url.searchParams.get("repo") ?? "";
    const number = Number(url.searchParams.get("number"));
    if (!Number.isInteger(number) || number <= 0) {
      return Response.json({ message: "Invalid issue number" }, { status: 400 });
    }
    cleared = clearIssueSnooze(repo, number);
  } else {
    return Response.json(
      { message: "kind must be submission or issue" },
      { status: 400 },
    );
  }

  if (cleared) {
    publish({ type: "intake", action: "resurfaced", kind });
  }
  return Response.json({ cleared });
};
