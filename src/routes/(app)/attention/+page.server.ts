import { attentionBreaches } from "#lib/server/attention/queries";
import type { PageServerLoad } from "./$types";

/**
 * Rule breaches are only rendered by Attention, so they are evaluated here
 * rather than in the shared `(app)` layout. The layout still supplies the
 * blocked feed and waiting rows.
 */
export const load: PageServerLoad = async () => {
  return { breaches: await attentionBreaches() };
};
