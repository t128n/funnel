import type { RequestHandler } from "./$types";
import { outcomeResponse } from "#lib/server/http/outcome";
import { apiRole } from "#lib/server/http/session";
import { authenticate, scheduleRefresh } from "#lib/server/issues/http";
import { addIssueComment } from "#lib/server/issues/mutations";
import { deleteWorkNote, getWorkNote, workNoteTarget } from "#lib/server/work-notes";

/**
 * Publish an internal work note to GitHub as a comment (SPEC §9.2).
 *
 * Publishing is a one-way move: the comment is posted and the note is deleted,
 * so it leaves the internal journal and joins the public activity timeline.
 * Requires the signed-in user's GitHub token, so it runs through the same
 * authentication as the other GitHub-backed writes.
 */
export const POST: RequestHandler = async ({ params, locals }) => {
  const denied = apiRole(locals, "write");
  if (denied instanceof Response) return denied;

  const auth = await authenticate(locals.user?.id);
  if (!auth.ok) return auth.response;

  const note = getWorkNote(params.id);
  const target = workNoteTarget(params.id);
  if (!note || !target) {
    return Response.json({ message: "Work note not found" }, { status: 404 });
  }

  const repo = `${target.org}/${target.name}`;
  const result = await addIssueComment({
    octokit: auth.octokit,
    repo,
    number: target.issueNumber,
    body: note.body,
  });
  if (!result.ok) return outcomeResponse(result);

  // The comment now carries the content; drop the internal note.
  deleteWorkNote(params.id);
  // Pull the new comment into the mirror so both open inspectors converge.
  scheduleRefresh(
    target.org,
    target.name,
    target.issueNumber,
    locals.user?.id,
  );
  return Response.json({ id: params.id });
};
