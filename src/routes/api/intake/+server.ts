/**
 * Public JSON intake endpoint (SPEC §6.1).
 *
 * Anonymous submitters POST `{ title, body?, source? }` from a third-party
 * page or CLI; the submission is staged in SQLite and triaged later. Nothing
 * reaches GitHub until a triager accepts it (SPEC §1.5). Open CORS is enabled
 * for browser callers, gated in practice by the instance's network
 * segmentation (SPEC §8).
 *
 * Abuse controls (issue #42): the per-IP limiter runs before anything else, a
 * hidden `company_website` honeypot is checked before schema validation, and
 * neither path ever stages a row or logs submission content.
 */
import * as v from "valibot";
import type { RequestHandler } from "./$types";
import { OPEN_CORS } from "#lib/server/http/cors";
import {
  checkIntakeRateLimit,
  intakeClientIp,
} from "#lib/server/intake/rate-limit";
import { createSubmission } from "#lib/server/intake/staging";
import { intakeSchema } from "#lib/server/intake/schema";
import { createLogger } from "#lib/server/log";
import { readSettings } from "#lib/server/settings/store";
import { publish } from "#lib/server/sync/events";

const log = createLogger({ component: "intake" });

function json(
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return Response.json(body, {
    status,
    headers: { ...OPEN_CORS, "Cache-Control": "no-store", ...headers },
  });
}

/**
 * Read the honeypot from the parsed JSON body without adding it to
 * `intakeSchema`, so the published OpenAPI contract never advertises it.
 */
function honeypotFilled(raw: unknown): boolean {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return false;
  const value = (raw as Record<string, unknown>).company_website;
  return typeof value === "string" && value.trim().length > 0;
}

export const POST: RequestHandler = async (event) => {
  const ip = intakeClientIp(event);
  const limit = checkIntakeRateLimit(ip);
  if (!limit.ok) {
    log.warn(
      { ip, reason: limit.reason, retryAfterSeconds: limit.retryAfterSeconds },
      "intake submission throttled",
    );
    return json(
      { message: "Too many submissions; try again later." },
      429,
      { "Retry-After": String(limit.retryAfterSeconds) },
    );
  }

  let raw: unknown;
  try {
    raw = await event.request.json();
  } catch {
    return json({ message: "Request body must be valid JSON" }, 400);
  }

  if (readSettings().intake.honeypot && honeypotFilled(raw)) {
    // Benign accepted-looking response: do not reveal the trap or stage work.
    log.warn({ ip, reason: "honeypot" }, "intake submission rejected");
    return json({ message: "Submission received" }, 202);
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
