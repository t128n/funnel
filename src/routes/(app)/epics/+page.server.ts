import { listEpics } from "#lib/server/epics/queries";
import type { PageServerLoad } from "./$types";

/**
 * The Epics view: every mirrored issue carrying the `epic` label. The query
 * already returns open epics before closed ones; rollups are computed from the
 * child refs in each epic body.
 */
export const load: PageServerLoad = async () => {
  return { epics: await listEpics() };
};
