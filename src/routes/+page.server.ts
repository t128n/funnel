import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

// There is no landing page; the cockpit opens on the Inbox (SPEC §9.2).
export const load: PageServerLoad = () => {
  throw redirect(307, "/inbox");
};
