import { fail } from "@sveltejs/kit";
import { createSubmission } from "#lib/server/intake/staging";
import { publish } from "#lib/server/sync/events";
import type { Actions, PageServerLoad } from "./$types";

/**
 * JavaScript-free submission form (SPEC §6.1). A plain HTML `<form>` posts here
 * and the staging primitives store the row; the Inbox picks it up via the SSE
 * `intake` event. No repo selectors or internal metadata are exposed.
 */
export const load: PageServerLoad = () => ({});

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await request.formData();
    const title = String(form.get("title") ?? "").trim();
    const body = String(form.get("body") ?? "").trim();
    const source = String(form.get("source") ?? "").trim();

    if (!title) {
      return fail(400, { error: "A title is required.", title, body, source });
    }
    if (title.length > 256) {
      return fail(400, {
        error: "Title must be at most 256 characters.",
        title,
        body,
        source,
      });
    }

    const { id } = createSubmission({
      title,
      body,
      source: source.length > 0 ? source : null,
    });
    publish({ type: "intake", action: "staged", id });

    return { submitted: true };
  },
};
