import { getConfig } from "#lib/server/config";
import { saveSettingsAction } from "#lib/server/settings/action";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
  const config = await getConfig();
  return { sync: config.sync };
};

export const actions: Actions = {
  save: ({ request, locals }) => saveSettingsAction(request, locals),
};
