/**
 * Session guard for Funnel-local write endpoints.
 *
 * Unlike the GitHub-backed writes (see `#lib/server/issues/http.ts`
 * `authenticate`), work notes and attachments are stored locally and need only
 * a signed-in cockpit session — no GitHub token. Returns the user id, or a 401
 * JSON `Response` the route can return directly.
 */

/** The signed-in user's id, or a ready 401 `Response`. */
export function apiSession(locals: App.Locals): string | Response {
  const id = locals.user?.id;
  if (!id) {
    return Response.json({ message: "Not authenticated" }, { status: 401 });
  }
  return id;
}
