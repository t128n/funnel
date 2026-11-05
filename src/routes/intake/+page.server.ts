import { fail } from "@sveltejs/kit";
import { INTAKE_BODY_MAX } from "#lib/intake-prefill";
import { readSubmissionPrefill } from "#lib/server/intake/prefill";
import {
  checkIntakeRateLimit,
  intakeClientIp,
} from "#lib/server/intake/rate-limit";
import { createSubmission } from "#lib/server/intake/staging";
import { createLogger } from "#lib/server/log";
import { readSettings } from "#lib/server/settings/store";
import { publish } from "#lib/server/sync/events";
import type { Actions, PageServerLoad } from "./$types";

const log = createLogger({ component: "intake" });

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
 *
 * Abuse controls (issue #42) mirror the JSON endpoint: a per-IP limiter runs
 * before validation, and a filled hidden honeypot returns the normal success
 * state without staging anything. Throttled submissions return the draft so a
 * real user does not lose it.
 */
export const load: PageServerLoad = ({ url }) => ({
  prefill: readSubmissionPrefill(url.searchParams),
  selfSynced: url.searchParams.has("s"),
});

/** Human-readable wait for the form's inline status. */
function retryMessage(seconds: number): string {
  if (seconds >= 120) {
    const minutes = Math.ceil(seconds / 60);
    return `Too many submissions from this address. Try again in about ${minutes} minutes.`;
  }
  if (seconds >= 60) {
    return "Too many submissions from this address. Try again in about 1 minute.";
  }
  return `Too many submissions from this address. Try again in ${seconds} second${
    seconds === 1 ? "" : "s"
  }.`;
}

export const actions: Actions = {
  default: async (event) => {
    const form = await event.request.formData();
    const title = String(form.get("title") ?? "").trim();
    const body = String(form.get("body") ?? "").trim();
    const source = String(form.get("source") ?? "").trim();

    const ip = intakeClientIp(event);
    const limit = checkIntakeRateLimit(ip);
    if (!limit.ok) {
      log.warn(
        { ip, reason: limit.reason, retryAfterSeconds: limit.retryAfterSeconds },
        "intake submission throttled",
      );
      return fail(429, {
        error: retryMessage(limit.retryAfterSeconds),
        retryAfterSeconds: limit.retryAfterSeconds,
        title,
        body,
        source,
      });
    }

    const honeypot = String(form.get("company_website") ?? "").trim();
    if (readSettings().intake.honeypot && honeypot.length > 0) {
      // Same confirmation as a real submission; never reveal the trap or stage.
      log.warn({ ip, reason: "honeypot" }, "intake submission rejected");
      return { submitted: true };
    }

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

    return { submitted: true, ref: id };
  },
};
