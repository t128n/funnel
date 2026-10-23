/**
 * Route guards for the authenticated cockpit (SPEC §8).
 *
 * Reads run against the local mirror, but every mutation executes with the
 * signed-in user's token, and the sidebar renders their identity, so the four
 * cockpit views require a session. RBAC layers on top: `read` may view,
 * `write` may mutate, and `admin` may manage instance settings and people
 * (see `#lib/roles`). Guards are the single server-side enforcement point; the
 * UI only mirrors them cosmetically.
 *
 * The public surface stays open: `/login`, `/intake`, `POST /api/intake`.
 */
import { error, redirect } from "@sveltejs/kit";
import { hasRole, normalizeRole, type Role } from "#lib/roles";

export interface ViewerUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  /** The viewer's normalized RBAC role. */
  role: Role;
}

/** Project a session user (whose `role` is added by the Better Auth admin plugin) into a {@link ViewerUser}. */
function toViewerUser(user: NonNullable<App.Locals["user"]>): ViewerUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image ?? null,
    role: normalizeRole((user as { role?: unknown }).role),
  };
}

/** Return the session user or redirect to `/login`. */
export function requireUser(locals: App.Locals, url: URL): ViewerUser {
  const user = locals.user;
  if (!user) {
    const target = `${url.pathname}${url.search}`;
    throw redirect(303, `/login?redirectTo=${encodeURIComponent(target)}`);
  }
  return toViewerUser(user);
}

/**
 * Require at least the `min` role. Unauthenticated visitors are redirected to
 * `/login` (with a return path); an authenticated visitor without the role gets
 * a 403 instead of a redirect, so the reason is explicit.
 */
export function requireRole(
  locals: App.Locals,
  url: URL,
  min: Role,
): ViewerUser {
  const user = requireUser(locals, url);
  if (!hasRole(user.role, min)) {
    throw error(403, "You do not have access to this page.");
  }
  return user;
}

/** Require `admin`. */
export function requireAdmin(locals: App.Locals, url: URL): ViewerUser {
  return requireRole(locals, url, "admin");
}
