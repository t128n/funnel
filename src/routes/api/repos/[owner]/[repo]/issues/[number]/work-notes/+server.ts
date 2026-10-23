import * as v from "valibot";
import type { RequestHandler } from "./$types";
import { apiRole } from "#lib/server/http/session";
import { issueNumberParam, readJson } from "#lib/server/issues/http";
import { publish } from "#lib/server/sync/events";
import { getRepoByOrgName } from "#lib/server/sync/mirror";
import { resolveViewerRef } from "#lib/server/viewer";
import { createWorkNote } from "#lib/server/work-notes";

/**
 * Create an internal work note (ITSM-style journal).
 *
 * Stored locally in `state_work_note`; never posted to GitHub. Publishing is a
 * separate, explicit action (see `[id]/publish`). The author is derived from the
 * session, not the request body.
 */
const createSchema = v.object({
  body: v.pipe(
    v.string("Note must be a string"),
    v.trim(),
    v.nonEmpty("Note must not be empty"),
    v.maxLength(65536, "Note is too long"),
  ),
});

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const denied = apiRole(locals, "write");
  if (denied instanceof Response) return denied;

  const number = issueNumberParam(params.number);
  if (number instanceof Response) return number;
  if (!getRepoByOrgName(params.owner, params.repo)) {
    return Response.json(
      {
        message: `Repository ${params.owner}/${params.repo} is not mirrored`,
      },
      { status: 404 },
    );
  }

  const read = await readJson(request);
  if (!read.ok) return read.response;

  const parsed = v.safeParse(createSchema, read.body);
  if (!parsed.success) {
    return Response.json(
      {
        message: "Invalid work note",
        issues: parsed.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  const note = createWorkNote({
    org: params.owner,
    name: params.repo,
    issueNumber: number,
    author: await resolveViewerRef(locals),
    body: parsed.output.body,
  });

  publish({
    type: "issues",
    repo: `${params.owner}/${params.repo}`,
    numbers: [number],
  });
  return Response.json(note, { status: 201 });
};
