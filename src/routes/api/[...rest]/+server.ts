/**
 * JSON fallback for unmatched `/api/*` paths.
 *
 * SvelteKit's error handling is content-negotiated, but a browser or a client
 * that sends `Accept: text/html` would otherwise receive the HTML error page
 * for an unknown endpoint. This catch-all guarantees a JSON 404 so API
 * consumers always get a machine-readable body. More specific routes (the
 * mirror, repos, auth, intake endpoints) win over it.
 */
import type { RequestHandler } from "./$types";

const notFound: RequestHandler = () =>
  Response.json(
    { message: "Not found" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
export const OPTIONS = notFound;
export const HEAD = notFound;
