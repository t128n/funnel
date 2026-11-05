import { getViewerExternalId } from "#lib/server/auth/index";
import { requireUser } from "#lib/server/auth/guard";
import { FEATURES_COOKIE, parseFeatureOverrides } from "#lib/features";
import { getConfig, repoShortcodeMap } from "#lib/server/config";
import { COMMENT_BUBBLES_FLAG, resolveFeatures } from "#lib/server/flags";
import { EMPTY_FILTER } from "#lib/server/issues/filters";
import {
  attentionIssues,
  filterOptions,
  inboxCount,
  waitingIssues,
} from "#lib/server/issues/queries";
import { unreadNotificationCount } from "#lib/server/notifications/service";
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
  const [options, config, viewerExternalId, features] = await Promise.all([
    Promise.resolve(filterOptions()),
    getConfig(),
    getViewerExternalId(user.id),
    resolveFeatures(overrides),
  ]);

  const viewerGithub =
    viewerExternalId === null
      ? null
      : (getUser(viewerExternalId, "github", new URL(config.github.url).host) ??
        null);

  // Sidebar badge for Inbox: pending submissions + untriaged open issues
  // (SPEC §2.1), the queue a maintainer actually has to triage. Counted
  // directly so the badge never hydrates the whole queue.
  const inboxTotal = inboxCount(EMPTY_FILTER);

  // Waiting is loaded separately from blocked Attention items. The page renders
  // it in its own section; the sidebar Attention badge intentionally counts
  // only blocked overdue/today re-checks (see the app layout).
  const waiting = waitingIssues();

  // The badge counts this viewer's unread rows only; reading them is always
  // scoped by `auth_user.id`, never by a client-supplied id.
  const unreadNotifications = unreadNotificationCount(user.id);
  // T3 persists `notifications.native`; false only disables the browser channel.
  const nativeNotifications = config.notifications.native;

  return {
    user,
    viewerExternalId,
    viewerGithub,
    options,
    attention: attentionIssues(),
    waiting,
    inboxCount: inboxTotal,
    unreadNotifications,
    nativeNotifications,
    githubUrl: config.github.url,
    defaultRepo: config.intake.default_repo ?? config.repos[0]?.repo ?? "",
    labelPrefix: config.labels.prefix,
    repoShortcodes: repoShortcodeMap(config),
    projects: config.projects,
    doneDays: config.board.done_days,
    wipLimits: config.board.wip_limits,
    features,
    commentBubbles: features[COMMENT_BUBBLES_FLAG],
  };
};
