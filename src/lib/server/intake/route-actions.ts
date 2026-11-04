import { fail, type RequestEvent } from "@sveltejs/kit";
import { apiRole } from "#lib/server/http/session";
import { authenticate } from "#lib/server/issues/http";
import {
  acceptSubmission,
  dismissSubmission,
  duplicateSubmission,
} from "./actions";

/**
 * Inbox triage actions shared by `/inbox` and `/inbox/submission/<id>`.
 *
 * The queue table owns the forms, so the actions must live on the route that
 * renders it: SvelteKit applies a successful action at the action's own
 * location, and posting from `/inbox` to the submission route navigated to a
 * submission that the same action had just consumed (404). Keeping the
 * implementations here lets the detail page keep its action names without
 * duplicating the write path.
 */
type IntakeActionEvent = Pick<RequestEvent, "request" | "locals">;

export async function accept({ request, locals }: IntakeActionEvent) {
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
    provider: auth.provider,
    repo: repo || undefined,
    labels,
  });
  if (!result.ok) return fail(result.status, { message: result.message });
  return { accepted: true, ...result.value };
}

export async function dismiss({ request, locals }: IntakeActionEvent) {
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
}

export async function duplicate({ request, locals }: IntakeActionEvent) {
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
    provider: auth.provider,
    repo,
    number,
  });
  if (!result.ok) return fail(result.status, { message: result.message });
  return { duplicated: true, ...result.value };
}
