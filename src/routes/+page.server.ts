import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/**
 * The root is the friendly entry point: maintainers go straight to the
 * cockpit, everyone else lands on the public intake form (SPEC §9.2).
 */
export const load: PageServerLoad = ({ locals }) => {
  throw redirect(307, locals.user ? "/inbox" : "/intake");
};
