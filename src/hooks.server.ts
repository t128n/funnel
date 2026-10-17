import { building } from "$app/env";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { auth } from "#lib/server/auth/index";
import type { Handle } from "@sveltejs/kit/hooks";

export const handle: Handle = async ({ event, resolve }) => {
  // Populate `event.locals` once per request so `load` functions and actions
  // can read the session without re-resolving it. Better Auth's handler still
  // owns the `/api/auth/*` routes via `svelteKitHandler` below.
  if (!building) {
    const session = await auth.api.getSession({
      headers: event.request.headers,
    });
    event.locals.session = session?.session ?? null;
    event.locals.user = session?.user ?? null;
  }
  return svelteKitHandler({ auth, event, resolve, building });
};
