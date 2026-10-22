/**
 * Resolve the signed-in viewer to a {@link UserRef} for Funnel-local writes.
 *
 * Prefers the mirrored forge identity (login + avatar, refreshed by sync) and
 * falls back to the Better Auth profile when the viewer has not appeared on any
 * mirrored issue yet. Used to snapshot the author of a work note or the uploader
 * of an attachment.
 */
import { getViewerExternalId } from "#lib/server/auth/index";
import type { UserRef } from "#lib/server/issues/types";
import { getUser } from "#lib/server/sync/mirror";

export async function resolveViewerRef(
  locals: App.Locals,
): Promise<UserRef | null> {
  const user = locals.user;
  if (!user) return null;

  const externalId = await getViewerExternalId(user.id);
  if (externalId !== null) {
    const mirrored = getUser(externalId, "github", "github.com");
    if (mirrored) {
      return {
        externalId: mirrored.externalId,
        forge: mirrored.forge,
        instance: mirrored.instance,
        login: mirrored.login,
        avatarUrl: mirrored.avatarUrl,
      };
    }
  }

  return {
    externalId: externalId ?? "",
    forge: "github",
    instance: "github.com",
    login: user.name || "unknown",
    avatarUrl: user.image ?? "",
  };
}
