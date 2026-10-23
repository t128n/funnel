import type { RequestHandler } from "./$types";
import {
  authenticateWrite,
  issueNumberParam,
  scheduleRefresh,
} from "#lib/server/issues/http";
import { removeIssueLabel } from "#lib/server/issues/mutations";
import { outcomeResponse } from "#lib/server/http/outcome";

/** Remove a single label from an issue (SPEC §5.2.5). */
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const auth = await authenticateWrite(locals);
  if (!auth.ok) return auth.response;

  const number = issueNumberParam(params.number);
  if (number instanceof Response) return number;

  const result = await removeIssueLabel({
    provider: auth.provider,
    repo: `${params.owner}/${params.repo}`,
    number,
    name: params.name,
  });
  if (result.ok) {
    scheduleRefresh(params.owner, params.repo, number, locals.user?.id);
  }
  return outcomeResponse(result);
};
