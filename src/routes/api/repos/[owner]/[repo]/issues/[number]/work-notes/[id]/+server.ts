import * as v from "valibot";
import type { RequestHandler } from "./$types";
import { apiSession } from "#lib/server/http/session";
import { readJson } from "#lib/server/issues/http";
import { publish } from "#lib/server/sync/events";
import {
  deleteWorkNote,
  updateWorkNote,
  workNoteTarget,
  type WorkNoteTarget,
} from "#lib/server/work-notes";

/**
 * Edit or delete an internal work note. Session-gated and local-only; editing a
 * published note does not rewrite the GitHub comment it produced.
 */
const updateSchema = v.object({
  body: v.pipe(
    v.string("Note must be a string"),
    v.trim(),
    v.nonEmpty("Note must not be empty"),
    v.maxLength(65536, "Note is too long"),
  ),
});

function notify(target: WorkNoteTarget | undefined): void {
  if (target) {
    publish({
      type: "issues",
      repo: `${target.org}/${target.name}`,
      numbers: [target.issueNumber],
    });
  }
}

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const denied = apiSession(locals);
  if (denied instanceof Response) return denied;

  const read = await readJson(request);
  if (!read.ok) return read.response;

  const parsed = v.safeParse(updateSchema, read.body);
  if (!parsed.success) {
    return Response.json(
      {
        message: "Invalid work note",
        issues: parsed.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  const target = workNoteTarget(params.id);
  const note = updateWorkNote(params.id, parsed.output.body);
  if (!note) {
    return Response.json({ message: "Work note not found" }, { status: 404 });
  }
  notify(target);
  return Response.json(note);
};

export const DELETE: RequestHandler = ({ params, locals }) => {
  const denied = apiSession(locals);
  if (denied instanceof Response) return denied;

  const target = workNoteTarget(params.id);
  if (!deleteWorkNote(params.id)) {
    return Response.json({ message: "Work note not found" }, { status: 404 });
  }
  notify(target);
  return new Response(null, { status: 204 });
};
