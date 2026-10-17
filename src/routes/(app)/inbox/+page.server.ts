import { fail } from "@sveltejs/kit";
import { authenticate } from "#lib/server/issues/http";
import {
  acceptSubmission,
  dismissSubmission,
  duplicateSubmission,
} from "#lib/server/intake/actions";
import { parseIssueFilter } from "#lib/server/issues/filters";
import { filterContext, inbox } from "#lib/server/issues/queries";
import type { Actions, PageServerLoad } from "./$types";

/**
 * Inbox (SPEC §6, §9.2): pending intake submissions followed by untriaged open
 * issues. Accept / Dismiss / Duplicate are SvelteKit form actions so the queue
 * works with the pessimistic UI and degrades to plain HTML without JS.
 */
export const load: PageServerLoad = async ({ url, parent }) => {
  const { viewerGithubId } = await parent();
  const filter = parseIssueFilter(url.searchParams, filterContext(viewerGithubId));
  return { inbox: inbox(filter) };
};

export const actions: Actions = {
  async accept({ request, locals }) {
    const auth = await authenticate(locals.user?.id);
    if (!auth.ok) return fail(401, { message: "Not authenticated" });

    const form = await request.formData();
    const id = String(form.get("id") ?? "");
    const repo = String(form.get("repo") ?? "").trim();
    if (!id) return fail(400, { message: "Missing submission id" });

    const labels = ["priority", "size"]
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

  async dismiss({ request }) {
    const form = await request.formData();
    const id = String(form.get("id") ?? "");
    if (!id) return fail(400, { message: "Missing submission id" });

    const result = dismissSubmission({ id });
    if (!result.ok) return fail(result.status, { message: result.message });
    return { dismissed: true, id };
  },

  async duplicate({ request, locals }) {
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
