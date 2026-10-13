import type { RequestHandler } from "./$types";
import {
  getInstallationId,
  github,
  installationErrorResponse,
} from "#lib/server/github/app.server.js";
import {
  passthrough,
  toResponse,
} from "#lib/server/github/api-passthrough.server.js";

/** Mirrors `GET /repos/{owner}/{repo}/issues/{number}`. */
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
    `/repos/${params.owner}/${params.repo}/issues/${params.number}`,
    new URLSearchParams(),
    request.headers.get("if-none-match"),
    {
      htmlUrlFallback: `https://github.com/${params.owner}/${params.repo}/issues/${params.number}`,
    },
  );
  return toResponse(result);
};
