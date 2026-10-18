import { FUNNEL_COMMENT_UI } from "$app/env/private";
import { getViewerGithubId } from "#lib/server/auth/index";
import { requireUser } from "#lib/server/auth/guard";
import { COMMENT_UI_COOKIE, parseCommentUi } from "#lib/comment-ui";
import { getConfig } from "#lib/server/config";
import { commentBubbles } from "#lib/server/flags";
import { filterOptions } from "#lib/server/issues/queries";
import type { LayoutServerLoad } from "./$types";

/**
 * Shared data for every cockpit view: the signed-in user (also enforcing the
 * session gate), the filter option lists, and host/board configuration used by
 * the Inspector's outbound links and the board's Done window. It also resolves
 * the comment-rendering flag, honouring a per-browser cookie before the
 * `FUNNEL_COMMENT_UI` default.
 */
export const load: LayoutServerLoad = async ({ locals, url, cookies }) => {
  const user = requireUser(locals, url);
  const commentUi =
    parseCommentUi(cookies.get(COMMENT_UI_COOKIE)) ?? FUNNEL_COMMENT_UI;
  const [options, config, viewerGithubId, chatComments] = await Promise.all([
    Promise.resolve(filterOptions()),
    getConfig(),
    getViewerGithubId(user.id),
    commentBubbles(commentUi),
  ]);

  return {
    user,
    viewerGithubId,
    options,
    githubUrl: config.github.url,
    defaultRepo: config.intake.default_repo ?? config.repos[0] ?? "",
    doneDays: config.board.done_days,
    commentBubbles: chatComments,
  };
};
