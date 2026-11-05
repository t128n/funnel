import { accept, dismiss, undo } from "#lib/server/intake/route-actions";
import { snoozedInbox } from "#lib/server/issues/queries";
import type { Actions, PageServerLoad } from "./$types";

/**
 * Triage actions live on the route that owns the queue forms. A submission
 * decision posted from `/inbox` therefore settles on `/inbox` instead of
 * navigating to the just-consumed submission page (which returned 404).
 */
export const actions: Actions = { accept, dismiss, undo };

/**
 * Snoozed view data (`?snoozed=1`). The queue itself is loaded by the Inbox
 * layout; this load only adds the deferred items and their count, which the
 * queue badge deliberately excludes.
 */
export const load: PageServerLoad = ({ url }) => {
  const snoozed = url.searchParams.get("snoozed") === "1";
  const items = snoozedInbox();
  return {
    snoozedView: snoozed,
    snoozedItems: items,
    snoozedCount: items.length,
  };
};
