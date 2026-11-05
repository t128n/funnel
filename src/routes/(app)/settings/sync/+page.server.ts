import { fail } from "@sveltejs/kit";
import { canAdmin } from "#lib/roles";
import { getConfig } from "#lib/server/config";
import { saveSettingsAction } from "#lib/server/settings/action";
import { syncStatus } from "#lib/server/sync/status";
import { syncAllRepos } from "#lib/server/sync/worker";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
  const [config, status] = await Promise.all([getConfig(), syncStatus()]);
  return { sync: config.sync, status };
};

export const actions: Actions = {
  save: ({ request, locals }) => saveSettingsAction(request, locals),

  /**
   * Manual trigger for one full cycle. Actions do not run a layout load, so the
   * admin role is re-checked here even though `/settings/sync` is admin-only.
   *
   * `syncAllRepos` isolates per-repository failures and returns a summary; a
   * partial or total failure is reported as a form failure so the page can
   * explain it while the table shows the affected repositories.
   */
  sync: async ({ locals }) => {
    if (!locals.user) return fail(401, { syncError: "Not authenticated" });
    if (!canAdmin((locals.user as { role?: unknown }).role)) {
      return fail(403, { syncError: "Administrator role required" });
    }

    const result = await syncAllRepos();
    if (result.failed > 0) {
      return fail(502, {
        syncError:
          result.failed === result.repos
            ? `Sync failed for all ${result.repos} configured repositories. Check the server log for the last error.`
            : `Sync finished with ${result.failed} of ${result.repos} repositories failing. Check the server log for the last error, then retry.`,
      });
    }
    return { synced: true, repos: result.repos };
  },
};
