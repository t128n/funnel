import type { RequestHandler } from "./$types";
import { github, webUrl } from "#lib/server/github/app.server.js";
import {
  passthrough,
  toResponse,
} from "#lib/server/github/api-passthrough.server.js";

/** Mirrors `GET /users/{username}` (login + avatar URLs).
 * No repo context, so this uses the App-JWT client and a
 * dedicated cache namespace (`0`). */
export const GET: RequestHandler = async ({ params, request }) => {
  const result = await passthrough(
    await github.asApp(),
    0,
    `/users/${encodeURIComponent(params.username)}`,
    new URLSearchParams(),
    request.headers.get("if-none-match"),
    { htmlUrlFallback: await webUrl(params.username) },
  );
  return toResponse(result);
};
