import { error } from "@sveltejs/kit";
import { latestTriageEvent } from "#lib/server/intake/events";
import { accept, dismiss, duplicate, undo } from "#lib/server/intake/route-actions";
import { getSubmission } from "#lib/server/intake/staging";
import { renderMarkdown } from "#lib/server/markdown/render";
import type { Actions, PageServerLoad } from "./$types";

/**
 * A submission resolves by id. A pending row (including a currently snoozed
 * one) renders the live review page; an archived row stays viewable so an
 * inline Undo survives the SSE refresh that follows a dismissal. A missing id
 * is a real 404.
 */
export const load: PageServerLoad = ({ params }) => {
  const staged = getSubmission(params.id);
  if (!staged) error(404, "Submission not found");

  if (staged.archivedAt === null) {
    return { archivedSubmission: null, archivedUndoEventId: null };
  }

  const latest = latestTriageEvent(params.id);
  return {
    archivedSubmission: {
      ...staged,
      bodyHtml: renderMarkdown(staged.body),
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
