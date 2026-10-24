/**
 * `/settings/planning` (SPEC §1, §6).
 *
 * The settings layout enforces `admin`; this load only needs a session so the
 * page can project the current planning section and the maintainer candidates
 * (assignable users of the configured repositories).
 */
import { requireUser } from "#lib/server/auth/guard";
import { getConfig } from "#lib/server/config";
import { listAssigneeCandidates } from "#lib/server/planning/queries";
import { saveSettingsAction } from "#lib/server/settings/action";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
  requireUser(locals, url);

  const config = await getConfig();
  const repoSlugs = config.repos.map((entry) => entry.repo);

  return {
    planning: config.planning,
    candidates: listAssigneeCandidates(repoSlugs),
  };
};

export const actions: Actions = {
  save: ({ request, locals }) => saveSettingsAction(request, locals),
};
