import { requireUser } from "#lib/server/auth/guard";
import {
  listNotifications,
  notificationCount,
  unreadNotificationCount,
} from "#lib/server/notifications/service";
import type { PageServerLoad } from "./$types";

const DEFAULT_LIMIT = 100;

/** A bounded request for older rows; the page raises this as the reader asks. */
function requestedLimit(value: string | null): number {
  if (value === null || value.trim() === "") return DEFAULT_LIMIT;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_LIMIT;
}

/**
 * The notification center (SPEC §3.3): the signed-in viewer's rows, newest
 * first. The read is scoped by `auth_user.id` inside the service; the page never
 * accepts a user id from the client. Unread rows lead the list, so the load
 * returns one feed and lets the page split it.
 *
 * `?limit=` grows the loaded window when the reader chooses "Load older". The
 * returned `total` is the viewer's real row count, so the header count and the
 * list footer cannot disagree about rows that exist past the first window.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  const user = requireUser(locals, url);
  const total = notificationCount(user.id);
  const limit = Math.max(1, Math.min(requestedLimit(url.searchParams.get("limit")), total));
  const items = listNotifications(user.id, { limit });
  return {
    items,
    total,
    unreadCount: unreadNotificationCount(user.id),
  };
};
