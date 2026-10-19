/**
 * Session and role guards for Funnel-local write endpoints.
 *
 * Unlike the GitHub-backed writes (see `#lib/server/issues/http.ts`
 * `authenticate`), work notes and attachments are stored locally and need only
 * a signed-in cockpit session — no GitHub token. `apiRole` additionally enforces
 * the RBAC minimum (see `#lib/roles`). Each returns the user id, or a ready
 * 401/403 JSON `Response` the route can return directly.
 */
import { hasRole, type Role } from "#lib/roles";

/** The signed-in user's id, or a ready 401 `Response`. */
export function apiSession(locals: App.Locals): string | Response {
  const id = locals.user?.id;
  if (!id) {
    return Response.json({ message: "Not authenticated" }, { status: 401 });
  }
  return id;
}

/**
 * Require the signed-in user to hold at least `min`. Returns the user id, or a
 * 401 (no session) / 403 (insufficient role) `Response`.
 */
export function apiRole(locals: App.Locals, min: Role): string | Response {
  const user = locals.user;
  if (!user) {
    return Response.json({ message: "Not authenticated" }, { status: 401 });
  }
  if (!hasRole((user as { role?: unknown }).role, min)) {
    return Response.json({ message: "Forbidden" }, { status: 403 });
  }
  return user.id;
}
