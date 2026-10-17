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

/** Mirrors `GET /repos/{owner}/{repo}/labels/{name}`. */
export const GET: RequestHandler = async ({ params, request }) => {
  let installationId: number;
  try {
    installationId = await getInstallationId(params.owner, params.repo);
  } catch (e) {
    return installationErrorResponse(params.owner, params.repo, e);
  }
  const result = await passthrough(
    await github.asInstallation(installationId),
    installationId,
    `/repos/${params.owner}/${params.repo}/labels/${encodeURIComponent(params.name)}`,
    new URLSearchParams(),
    request.headers.get("if-none-match"),
    {
      htmlUrlFallback: await webUrl(
        `${params.owner}/${params.repo}/labels/${encodeURIComponent(params.name)}`,
      ),
    },
  );
  return toResponse(result);
};
