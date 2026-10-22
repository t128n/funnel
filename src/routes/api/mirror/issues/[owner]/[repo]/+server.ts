import { repoIssueOptions } from "#lib/server/issues/queries";
import { apiRole } from "#lib/server/http/session";
import { getRepoByOrgName } from "#lib/server/sync/mirror";
import type { RequestHandler } from "./$types";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

/**
 * Read-only list of mirrored issues for one repo, backing the intake
 * "duplicate" picker (SPEC §6.2). Only mirrored issues are offered because the
 * duplicate action resolves its target against the local mirror. Requires a
 * signed-in `read` session like every other cockpit read.
 */
export const GET: RequestHandler = ({ params, url, locals }) => {
  const denied = apiRole(locals, "read");
  if (denied instanceof Response) return denied;

  const repo = getRepoByOrgName(params.owner, params.repo);
  if (!repo) {
    return Response.json(
      { message: `Repository ${params.owner}/${params.repo} is not mirrored` },
      { status: 404 },
    );
  }

  const requested = Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  return Response.json(repoIssueOptions(repo.id, { limit }));
};
