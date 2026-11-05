import { error } from "@sveltejs/kit";
import { latestTriageEvent } from "#lib/server/intake/events";
import { accept, dismiss, duplicate, undo } from "#lib/server/intake/route-actions";
import { getSubmission } from "#lib/server/intake/staging";
import { renderMarkdown } from "#lib/server/markdown/render";
import type { Actions, PageServerLoad } from "./$types";

/**
 * A pending submission resolves from the Inbox feed. An archived submission
 * stays viewable by id so an inline Undo survives the SSE refresh that follows
 * a dismissal; anything else is a real 404.
 */
export const load: PageServerLoad = async ({ params, parent }) => {
  const { inbox } = await parent();
  const found = inbox.entries.some(
    (entry) => entry.kind === "submission" && entry.submission.id === params.id,
  );
  if (found) return { archivedSubmission: null, archivedUndoEventId: null };

  const archived = getSubmission(params.id);
  if (!archived || archived.archivedAt === null) {
    error(404, "Submission not found");
  }

  const latest = latestTriageEvent(params.id);
  return {
    archivedSubmission: {
      ...archived,
      bodyHtml: renderMarkdown(archived.body),
    },
    archivedUndoEventId: latest?.action === "dismissed" ? latest.id : null,
  };
};

/**
 * The submission review page keeps the action names its own forms post to.
 * The implementations live in `#lib/server/intake/route-actions` because the
 * Inbox queue owns the same decisions and must run them on its own route.
 */
export const actions: Actions = { accept, dismiss, duplicate, undo };
