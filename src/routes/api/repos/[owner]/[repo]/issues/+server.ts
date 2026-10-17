import type { RequestHandler } from "./$types";
import {
  getInstallationId,
  github,
  installationErrorResponse,
} from "#lib/server/github/app.server";
import {
  passthrough,
  toResponse,
} from "#lib/server/github/api-passthrough.server";

/** Mirrors `GET /repos/{owner}/{repo}/issues`. Entries with a
 * `pull_request` key are dropped. Unknown query params are ignored,
 * like GitHub. */
const ALLOWED = new Set([
  "state",
  "labels",
  "assignee",
  "creator",
  "mentioned",
  "milestone",
  "since",
  "sort",
  "direction",
  "per_page",
  "page",
]);

export const GET: RequestHandler = async ({ params, url, request }) => {
  let installationId: number;
  try {
    installationId = await getInstallationId(params.owner, params.repo);
  } catch (e) {
    return installationErrorResponse(params.owner, params.repo, e);
  }
  const query = new URLSearchParams();
  for (const [k, v] of url.searchParams) {
    if (ALLOWED.has(k)) query.append(k, v);
  }
  const result = await passthrough(
    await github.asInstallation(installationId),
    installationId,
    `/repos/${params.owner}/${params.repo}/issues`,
    query,
    request.headers.get("if-none-match"),
    { filterPullRequests: true },
  );
  return toResponse(result);
};
