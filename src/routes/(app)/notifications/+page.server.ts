import { requireUser } from "#lib/server/auth/guard";
import {
  listNotifications,
  unreadNotificationCount,
} from "#lib/server/notifications/service";
import type { PageServerLoad } from "./$types";

/**
 * The notification center (SPEC §3.3): the signed-in viewer's rows, newest
 * first. The read is scoped by `auth_user.id` inside the service; the page never
 * accepts a user id from the client. Unread rows lead the list, so the load
 * returns one feed and lets the page split it.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  const user = requireUser(locals, url);
  const items = listNotifications(user.id, { limit: 100 });
  return {
    items,
    unreadCount: unreadNotificationCount(user.id),
  };
};
