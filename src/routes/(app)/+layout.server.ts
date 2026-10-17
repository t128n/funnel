import { getViewerGithubId } from "#lib/server/auth/index";
import { requireUser } from "#lib/server/auth/guard";
import { getConfig } from "#lib/server/config";
import { filterOptions } from "#lib/server/issues/queries";
import type { LayoutServerLoad } from "./$types";

/**
 * Shared data for every cockpit view: the signed-in user (also enforcing the
 * session gate), the filter option lists, and host/board configuration used by
 * the Inspector's outbound links and the board's Done window.
 */
export const load: LayoutServerLoad = async ({ locals, url }) => {
  const user = requireUser(locals, url);
  const [options, config, viewerGithubId] = await Promise.all([
    Promise.resolve(filterOptions()),
    getConfig(),
    getViewerGithubId(user.id),
  ]);

  return {
    user,
    viewerGithubId,
    options,
    githubUrl: config.github.url,
    defaultRepo: config.intake.default_repo ?? config.repos[0] ?? "",
    doneDays: config.board.done_days,
  };
};
