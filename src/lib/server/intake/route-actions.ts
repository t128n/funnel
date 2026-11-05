import { fail, type RequestEvent } from "@sveltejs/kit";
import { apiRole } from "#lib/server/http/session";
import { authenticate } from "#lib/server/issues/http";
import {
  acceptSubmission,
  dismissSubmission,
  duplicateSubmission,
  undoTriageEvent,
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

/** Required `write` session, or the failure response to return. */
function requireWrite(locals: IntakeActionEvent["locals"]) {
  const denied = apiRole(locals, "write");
  if (denied instanceof Response) {
    return fail(denied.status, {
      message: denied.status === 403 ? "Write access required" : "Not authenticated",
    });
  }
  const actorUserId = locals.user?.id;
  if (!actorUserId) return fail(401, { message: "Not authenticated" });
  return { actorUserId };
}

/** Comma-separated and repeated form values, trimmed and de-duplicated. */
function formList(form: FormData, key: string): string[] {
  const values = form
    .getAll(key)
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return [...new Set(values)];
}

export async function accept({ request, locals }: IntakeActionEvent) {
  const session = requireWrite(locals);
  if (!("actorUserId" in session)) return session;

  const auth = await authenticate(locals.user?.id);
  if (!auth.ok) return fail(401, { message: "Not authenticated" });

  const form = await request.formData();
  const id = String(form.get("id") ?? "");
  const repo = String(form.get("repo") ?? "").trim();
  const status = String(form.get("status") ?? "").trim();
  if (!id) return fail(400, { message: "Missing submission id" });

  const labels = [...formList(form, "size"), ...formList(form, "labels")];

  const result = await acceptSubmission({
    id,
    actorUserId: session.actorUserId,
    provider: auth.provider,
    repo: repo || undefined,
    status: status || undefined,
    labels,
    assignees: formList(form, "assignees"),
  });
  if (!result.ok) return fail(result.status, { message: result.message });
  return { accepted: true, ...result.value };
}

export async function dismiss({ request, locals }: IntakeActionEvent) {
  // Dismissing only touches the local staging table, so a `write` session is
  // enough; unlike accept/duplicate it needs no user GitHub token.
  const session = requireWrite(locals);
  if (!("actorUserId" in session)) return session;

  const form = await request.formData();
  const id = String(form.get("id") ?? "");
  const reason = String(form.get("reason") ?? "");
  if (!id) return fail(400, { message: "Missing submission id" });

  const result = await dismissSubmission({
    id,
    actorUserId: session.actorUserId,
    reason,
  });
  if (!result.ok) return fail(result.status, { message: result.message });
  return { dismissed: true, ...result.value };
}

/** Undo the latest dismissal. Local state only, so no GitHub token is needed. */
export async function undo({ request, locals }: IntakeActionEvent) {
  const session = requireWrite(locals);
  if (!("actorUserId" in session)) return session;

  const form = await request.formData();
  const eventId = String(form.get("eventId") ?? "");
  if (!eventId) return fail(400, { message: "Missing triage event id" });

  const result = await undoTriageEvent(eventId, session.actorUserId);
  if (!result.ok) return fail(result.status, { message: result.message });
  return { undone: true, ...result.value };
}

export async function duplicate({ request, locals }: IntakeActionEvent) {
  const session = requireWrite(locals);
  if (!("actorUserId" in session)) return session;

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
    actorUserId: session.actorUserId,
    provider: auth.provider,
    repo,
    number,
  });
  if (!result.ok) return fail(result.status, { message: result.message });
  return { duplicated: true, ...result.value };
}
