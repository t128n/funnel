import { repoIssueOptions } from "#lib/server/issues/queries";
import { getRepoByOrgName } from "#lib/server/sync/mirror";
import type { RequestHandler } from "./$types";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

/**
 * Read-only list of mirrored issues for one repo, backing the intake
 * "duplicate" picker (SPEC §6.2). Only mirrored issues are offered because the
 * duplicate action resolves its target against the local mirror. Kept ungated
 * to match the other mirror-backed read routes (SPEC §8).
 */
export const GET: RequestHandler = ({ params, url }) => {
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

  return Response.json(repoIssueOptions(repo.githubId, { limit }));
};
