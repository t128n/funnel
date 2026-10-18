/**
 * Public JSON intake endpoint (SPEC §6.1).
 *
 * Anonymous submitters POST `{ title, body?, source? }` from a third-party
 * page or CLI; the submission is staged in SQLite and triaged later. Nothing
 * reaches GitHub until a triager accepts it (SPEC §1.5). Open CORS is enabled
 * for browser callers, gated in practice by the instance's network
 * segmentation (SPEC §8).
 */
import * as v from "valibot";
import type { RequestHandler } from "./$types";
import { OPEN_CORS } from "#lib/server/http/cors";
import { createSubmission } from "#lib/server/intake/staging";
import { publish } from "#lib/server/sync/events";

/**
 * GitHub caps issue titles at 256 characters; mirror that here.
 *
 * Exported so `tests/openapi.test.ts` can assert the published spec
 * (`static/openapi.yml`) still matches this schema — see that file for the
 * conversion details.
 */
export const intakeSchema = v.object({
  title: v.pipe(
    v.string("Title must be a string"),
    v.description(
      "Issue title. Trimmed; must be non-empty and at most 256 characters.",
    ),
    v.trim(),
    v.nonEmpty("Title is required"),
    v.maxLength(256, "Title must be at most 256 characters"),
  ),
  body: v.optional(
    v.pipe(
      v.string("Body must be a string"),
      v.description("Issue body (Markdown). At most 65536 characters."),
      v.maxLength(65536),
    ),
    "",
  ),
  source: v.optional(
    v.pipe(
      v.string(),
      v.description(
        "Free-form provenance label, e.g. the calling page or CLI. Trimmed.",
      ),
      v.trim(),
    ),
    "",
  ),
});

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { ...OPEN_CORS, "Cache-Control": "no-store" },
  });
}

export const POST: RequestHandler = async ({ request }) => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ message: "Request body must be valid JSON" }, 400);
  }

  const parsed = v.safeParse(intakeSchema, raw);
  if (!parsed.success) {
    return json(
      {
        message: "Invalid intake submission",
        issues: parsed.issues.map((issue) => issue.message),
      },
      400,
    );
  }

  const source = parsed.output.source.trim();
  const { id } = createSubmission({
    title: parsed.output.title,
    body: parsed.output.body,
    source: source.length > 0 ? source : null,
  });
  publish({ type: "intake", action: "created", id });
  return json({ id }, 201);
};

/** CORS preflight for browser submitters. */
export const OPTIONS: RequestHandler = () =>
  new Response(null, { status: 204, headers: OPEN_CORS });
