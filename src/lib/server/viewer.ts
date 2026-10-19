/**
 * Resolve the signed-in viewer to a {@link UserRef} for Funnel-local writes.
 *
 * Prefers the mirrored GitHub identity (login + avatar, refreshed by sync) and
 * falls back to the Better Auth profile when the viewer has not appeared on any
 * mirrored issue yet. Used to snapshot the author of a work note or the uploader
 * of an attachment.
 */
import { getViewerGithubId } from "#lib/server/auth/index";
import type { UserRef } from "#lib/server/issues/types";
import { getUser } from "#lib/server/sync/mirror";

export async function resolveViewerRef(
  locals: App.Locals,
): Promise<UserRef | null> {
  const user = locals.user;
  if (!user) return null;

  const githubId = await getViewerGithubId(user.id);
  if (githubId !== null) {
    const mirrored = getUser(githubId);
    if (mirrored) {
      return {
        githubId: mirrored.githubId,
        login: mirrored.login,
        avatarUrl: mirrored.avatarUrl,
      };
    }
  }

  return {
    githubId: githubId ?? 0,
    login: user.name || "unknown",
    avatarUrl: user.image ?? "",
  };
}
