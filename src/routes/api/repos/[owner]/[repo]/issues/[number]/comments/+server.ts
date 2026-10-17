import type { RequestHandler } from "./$types";
import {
  getInstallationId,
  github,
  installationErrorResponse,
  webUrl,
} from "#lib/server/github/app.server";
import {
  passthrough,
  toResponse,
} from "#lib/server/github/api-passthrough.server";

/** Mirrors `GET /repos/{owner}/{repo}/issues/{number}/comments`. */
const ALLOWED = new Set(["since", "per_page", "page"]);

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
    `/repos/${params.owner}/${params.repo}/issues/${params.number}/comments`,
    query,
    request.headers.get("if-none-match"),
    {
      htmlUrlFallback: await webUrl(
        `${params.owner}/${params.repo}/issues/${params.number}`,
      ),
    },
  );
  return toResponse(result);
};
