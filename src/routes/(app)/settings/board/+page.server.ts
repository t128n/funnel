import { getConfig } from "#lib/server/config";
import { saveSettingsAction } from "#lib/server/settings/action";
import { WIP_STAGES } from "#lib/server/settings/store";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
  const config = await getConfig();
  return { board: config.board, wipStages: WIP_STAGES };
};

export const actions: Actions = {
  save: ({ request, locals }) => saveSettingsAction(request, locals),
};
