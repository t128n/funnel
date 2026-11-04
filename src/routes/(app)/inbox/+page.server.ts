import { accept, dismiss } from "#lib/server/intake/route-actions";
import type { Actions } from "./$types";

/**
 * Triage actions live on the route that owns the queue forms. A submission
 * decision posted from `/inbox` therefore settles on `/inbox` instead of
 * navigating to the just-consumed submission page (which returned 404).
 */
export const actions: Actions = { accept, dismiss };
