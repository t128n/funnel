import type { RequestHandler } from "./$types";
import { authenticate, scheduleRefresh } from "#lib/server/issues/http";
import { removeIssueLabel } from "#lib/server/issues/mutations";
import { outcomeResponse } from "#lib/server/http/outcome";

/** Remove a single label from an issue (SPEC §5.2.5). */
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const auth = await authenticate(locals.user?.id);
  if (!auth.ok) return auth.response;

  const number = Number(params.number);
  if (!Number.isInteger(number) || number <= 0) {
    return Response.json({ message: "Invalid issue number" }, { status: 400 });
  }

  const result = await removeIssueLabel({
    octokit: auth.octokit,
    repo: `${params.owner}/${params.repo}`,
    number,
    name: params.name,
  });
  if (result.ok) scheduleRefresh(params.owner, params.repo, number);
  return outcomeResponse(result);
};
