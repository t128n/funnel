/**
 * Waiting-state API (Funnel-local, issue #32).
 *
 * `POST` marks an issue as waiting (or revises its reason, note and re-check
 * date); `DELETE` clears the state immediately. Neither touches GitHub: no
 * body edit, no label and no comment. Any `write` session may set or clear it,
 * matching the other local triage state.
 *
 * Successful writes publish an `issues` event scoped to the issue so open
 * cockpits refresh both the Attention feed and the Inspector.
 */
import * as v from "valibot";
import type { RequestHandler } from "./$types";
import { outcomeResponse } from "#lib/server/http/outcome";
import { apiRole } from "#lib/server/http/session";
import { clearWaiting, setWaiting } from "#lib/server/waiting";
import { publish } from "#lib/server/sync/events";

const setSchema = v.object({
  repo: v.pipe(v.string(), v.trim(), v.nonEmpty("Missing repository")),
  number: v.pipe(v.number(), v.integer(), v.minValue(1)),
  reason: v.pipe(v.string(), v.trim(), v.nonEmpty("Missing waiting reason")),
  note: v.optional(v.nullable(v.string())),
  recheckOn: v.optional(v.nullable(v.string())),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  const userId = apiRole(locals, "write");
  if (userId instanceof Response) return userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = v.safeParse(setSchema, body);
  if (!parsed.success) {
    return Response.json(
      {
        message: "Invalid waiting request",
        issues: parsed.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  const input = parsed.output;
  const result = setWaiting(
    input.repo,
    input.number,
    {
      reason: input.reason,
      note: input.note ?? null,
      recheckOn: input.recheckOn ?? null,
    },
    userId,
  );

  if (result.ok) {
    publish({
      type: "issues",
      repo: result.value.repo,
      numbers: [result.value.number],
    });
  }
  return outcomeResponse(result);
};

export const DELETE: RequestHandler = ({ url, locals }) => {
  const userId = apiRole(locals, "write");
  if (userId instanceof Response) return userId;

  const repo = url.searchParams.get("repo") ?? "";
  const number = Number(url.searchParams.get("number"));
  if (repo.trim().length === 0) {
    return Response.json({ message: "Missing repository" }, { status: 400 });
  }
  if (!Number.isInteger(number) || number <= 0) {
    return Response.json({ message: "Invalid issue number" }, { status: 400 });
  }

  const cleared = clearWaiting(repo, number);
  if (cleared) {
    publish({ type: "issues", repo: repo.trim(), numbers: [number] });
  }
  return Response.json({ cleared });
};
