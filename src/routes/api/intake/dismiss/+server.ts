/**
 * Bulk inbox dismissal helper (issue #30).
 *
 * The per-row Inbox form posts a SvelteKit action. Bulk selection cannot post
 * N independent forms, so this small JSON endpoint exposes the *same*
 * `dismissSubmission` path with the same required reason, `write` role and
 * audit event. It is deliberately one item per request: the client runs the
 * calls through the bounded bulk runner.
 */
import * as v from "valibot";
import type { RequestHandler } from "./$types";
import { apiRole } from "#lib/server/http/session";
import { outcomeResponse } from "#lib/server/http/outcome";
import {
  dismissSubmission,
  MAX_DISMISS_REASON,
} from "#lib/server/intake/actions";

const dismissSchema = v.object({
  id: v.pipe(v.string(), v.trim(), v.nonEmpty("Missing submission id")),
  reason: v.pipe(
    v.string(),
    v.trim(),
    v.nonEmpty("A dismissal reason is required"),
    v.maxLength(
      MAX_DISMISS_REASON,
      `Dismissal reason must be ${MAX_DISMISS_REASON} characters or fewer`,
    ),
  ),
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

  const parsed = v.safeParse(dismissSchema, body);
  if (!parsed.success) {
    return Response.json(
      {
        message: "Invalid dismissal request",
        issues: parsed.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  const result = dismissSubmission({
    id: parsed.output.id,
    actorUserId: userId,
    reason: parsed.output.reason,
  });
  return outcomeResponse(result);
};
