import { error } from "@sveltejs/kit";
import { accept, dismiss, duplicate } from "#lib/server/intake/route-actions";
import type { Actions, PageServerLoad } from "./$types";

/**
 * A staged submission that no longer exists is a real 404. The successful
 * triage path never triggers this: it clears the selection without
 * re-running the load (see `SubmissionDetail.settle`).
 */
export const load: PageServerLoad = async ({ params, parent }) => {
  const { inbox } = await parent();
  const found = inbox.entries.some(
    (entry) => entry.kind === "submission" && entry.submission.id === params.id,
  );
  if (!found) error(404, "Submission not found");
  return {};
};

/**
 * The submission review page keeps the action names its own forms post to.
 * The implementations live in `#lib/server/intake/route-actions` because the
 * Inbox queue owns the same decisions and must run them on its own route.
 */
export const actions: Actions = { accept, dismiss, duplicate };
