import { getViewerGithubId } from "#lib/server/auth/index";
import { requireUser } from "#lib/server/auth/guard";
import { FEATURES_COOKIE, parseFeatureOverrides } from "#lib/features";
import { getConfig, repoShortcodeMap } from "#lib/server/config";
import { COMMENT_BUBBLES_FLAG, resolveFeatures } from "#lib/server/flags";
import { attentionIssues, filterOptions } from "#lib/server/issues/queries";
import { getUser } from "#lib/server/sync/mirror";
import type { LayoutServerLoad } from "./$types";

/**
 * Shared data for every cockpit view: the signed-in user (also enforcing the
 * session gate), the filter option lists, and host/board configuration used by
 * the Inspector's outbound links, the board's Done window, and the per-stage
 * Work-in-Progress caps. It also resolves the feature flags, layering the
 * browser's cookie overrides over the instance defaults.
 */
export const load: LayoutServerLoad = async ({ locals, url, cookies }) => {
  const user = requireUser(locals, url);
  const overrides = parseFeatureOverrides(cookies.get(FEATURES_COOKIE));
  const [options, config, viewerGithubId, features] = await Promise.all([
    Promise.resolve(filterOptions()),
    getConfig(),
    getViewerGithubId(user.id),
    resolveFeatures(overrides),
  ]);

  const viewerGithub =
    viewerGithubId === null ? null : (getUser(viewerGithubId) ?? null);

  return {
    user,
    viewerGithubId,
    viewerGithub,
    options,
    attention: attentionIssues(),
    githubUrl: config.github.url,
    defaultRepo: config.intake.default_repo ?? config.repos[0]?.repo ?? "",
    repoShortcodes: repoShortcodeMap(config),
    projects: config.projects,
    doneDays: config.board.done_days,
    wipLimits: config.board.wip_limits,
    features,
    commentBubbles: features[COMMENT_BUBBLES_FLAG],
  };
};
