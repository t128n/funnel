import { error, fail } from "@sveltejs/kit";
import { apiRole } from "#lib/server/http/session";
import { authenticate } from "#lib/server/issues/http";
import {
  acceptSubmission,
  dismissSubmission,
  duplicateSubmission,
} from "#lib/server/intake/actions";
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
 * Inbox triage (SPEC §6): Accept / Dismiss / Duplicate as SvelteKit form
 * actions so the queue works with the pessimistic UI and degrades to plain HTML
 * without JS. The forms live in the submission detail pane, so the actions are
 * defined on this leaf route — SvelteKit only runs the leaf page's actions.
 */
export const actions: Actions = {
  async accept({ request, locals }) {
    const denied = apiRole(locals, "write");
    if (denied instanceof Response) {
      return fail(denied.status, {
        message: denied.status === 403 ? "Write access required" : "Not authenticated",
      });
    }

    const auth = await authenticate(locals.user?.id);
    if (!auth.ok) return fail(401, { message: "Not authenticated" });

    const form = await request.formData();
    const id = String(form.get("id") ?? "");
    const repo = String(form.get("repo") ?? "").trim();
    if (!id) return fail(400, { message: "Missing submission id" });

    const labels = ["size"]
      .map((key) => String(form.get(key) ?? "").trim())
      .filter((value) => value.length > 0);

    const result = await acceptSubmission({
      id,
      octokit: auth.octokit,
      repo: repo || undefined,
      labels,
    });
    if (!result.ok) return fail(result.status, { message: result.message });
    return { accepted: true, ...result.value };
  },

  async dismiss({ request, locals }) {
    // Dismissing only touches the local staging table, so a `write` session is
    // enough; unlike accept/duplicate it needs no user GitHub token.
    const denied = apiRole(locals, "write");
    if (denied instanceof Response) {
      return fail(denied.status, {
        message: denied.status === 403 ? "Write access required" : "Not authenticated",
      });
    }

    const form = await request.formData();
    const id = String(form.get("id") ?? "");
    if (!id) return fail(400, { message: "Missing submission id" });

    const result = await dismissSubmission({ id });
    if (!result.ok) return fail(result.status, { message: result.message });
    return { dismissed: true, id };
  },

  async duplicate({ request, locals }) {
    const denied = apiRole(locals, "write");
    if (denied instanceof Response) {
      return fail(denied.status, {
        message: denied.status === 403 ? "Write access required" : "Not authenticated",
      });
    }

    const auth = await authenticate(locals.user?.id);
    if (!auth.ok) return fail(401, { message: "Not authenticated" });

    const form = await request.formData();
    const id = String(form.get("id") ?? "");
    const repo = String(form.get("repo") ?? "").trim();
    const number = Number(form.get("number"));
    if (!id) return fail(400, { message: "Missing submission id" });
    if (!Number.isInteger(number) || number <= 0) {
      return fail(400, { message: "Enter a valid issue number" });
    }

    const result = await duplicateSubmission({
      id,
      octokit: auth.octokit,
      repo,
      number,
    });
    if (!result.ok) return fail(result.status, { message: result.message });
    return { duplicated: true, ...result.value };
  },
};
