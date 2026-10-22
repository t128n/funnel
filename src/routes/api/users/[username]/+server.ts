import type { RequestHandler } from "./$types";
import {
  passthrough,
  toResponse,
} from "#lib/server/github/api-passthrough.server";
import { forge } from "#lib/server/forge/providers.server";
import { apiRole } from "#lib/server/http/session";

/** Mirrors `GET /users/{username}` (login + avatar URLs).
 * No repo context, so this uses the App-JWT client and a
 * dedicated cache namespace (`0`). Requires a signed-in `read` session. */
export const GET: RequestHandler = async ({ params, request, locals }) => {
  const denied = apiRole(locals, "read");
  if (denied instanceof Response) return denied;

  const result = await passthrough(
    await forge.appProvider(),
    0,
    `/users/${encodeURIComponent(params.username)}`,
    new URLSearchParams(),
    request.headers.get("if-none-match"),
    { htmlUrlFallback: await forge.webUrl(params.username) },
  );
  return toResponse(result);
};
