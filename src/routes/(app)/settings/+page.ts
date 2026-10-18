import { redirect } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

/** `/settings` lands on the first section. */
export const load: PageLoad = () => {
  throw redirect(307, "/settings/appearance");
};
