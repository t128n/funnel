/**
 * Calendar feed self-service endpoint (SPEC §5).
 *
 * `POST` creates or rotates the caller's read-only ICS token; `DELETE` revokes
 * it. Both need only a session. The raw token is returned exactly once and is
 * never logged or stored in clear — the store keeps only its SHA-256 hash and
 * an eight-character hint.
 */
import type { RequestHandler } from "./$types";
import { apiSession } from "#lib/server/http/session";
import {
  revokeCalendarFeed,
  rotateCalendarFeed,
} from "#lib/server/planning/day-store";

export const POST: RequestHandler = ({ request, locals }) => {
  const userId = apiSession(locals);
  if (userId instanceof Response) return userId;

  const rotated = rotateCalendarFeed(userId);
  const url = new URL(`/api/calendar/${rotated.token}.ics`, request.url).toString();

  return Response.json(
    {
      token: rotated.token,
      url,
      hint: rotated.hint,
      createdAt: rotated.createdAt,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
};

export const DELETE: RequestHandler = ({ locals }) => {
  const userId = apiSession(locals);
  if (userId instanceof Response) return userId;

  revokeCalendarFeed(userId);
  return new Response(null, { status: 204 });
};
