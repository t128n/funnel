import { fail } from "@sveltejs/kit";
import { INTAKE_BODY_MAX } from "#lib/intake-prefill";
import { readSubmissionPrefill } from "#lib/server/intake/prefill";
import { createSubmission } from "#lib/server/intake/staging";
import { publish } from "#lib/server/sync/events";
import type { Actions, PageServerLoad } from "./$types";

/**
 * JavaScript-free submission form (SPEC §6.1). A plain HTML `<form>` posts here
 * and the staging primitives store the row; the Inbox picks it up via the SSE
 * `intake` event. No repo selectors or internal metadata are exposed.
 *
 * `GET ?title=…&body=…&source=…` renders a prefilled draft so external tools can
 * link straight into the form. The composer also self-hosts a compact
 * `?d=base64url(deflate-raw(json))` deeplink; both are clamped in
 * `#lib/intake-prefill`. The `s=1` marker means the URL was written by the page
 * itself, so it is not presented as a shared link.
 */
export const load: PageServerLoad = ({ url }) => ({
  prefill: readSubmissionPrefill(url.searchParams),
  selfSynced: url.searchParams.has("s"),
});

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
    if (body.length > INTAKE_BODY_MAX) {
      return fail(400, {
        error: `Description must be at most ${INTAKE_BODY_MAX.toLocaleString("en-US")} characters.`,
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
