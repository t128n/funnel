/**
 * Route guard for the authenticated cockpit (SPEC §8).
 *
 * Reads run against the local mirror, but every mutation executes with the
 * signed-in user's token, and the sidebar renders their identity, so the four
 * cockpit views require a session. Unauthenticated visitors are redirected to
 * `/login` with a `redirectTo` back to the page they tried to open.
 *
 * The public surface stays open: `/login`, `/submit`, `POST /api/intake`, and
 * the `/api/events` stream are deliberately ungated.
 */
import { redirect } from "@sveltejs/kit";

export interface ViewerUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

/** Return the session user or redirect to `/login`. */
export function requireUser(
  locals: App.Locals,
  url: URL,
): ViewerUser {
  const user = locals.user;
  if (!user) {
    const target = `${url.pathname}${url.search}`;
    throw redirect(303, `/login?redirectTo=${encodeURIComponent(target)}`);
  }
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image ?? null,
  };
}
