import type { RequestHandler } from "./$types";
import { installationErrorResponse } from "#lib/server/github/app.server";
import {
  passthrough,
  toResponse,
} from "#lib/server/github/api-passthrough.server";
import { forge } from "#lib/server/forge/providers.server";
import { apiRole } from "#lib/server/http/session";

/** Mirrors `GET /repos/{owner}/{repo}/labels`. */
const ALLOWED = new Set(["per_page", "page"]);

export const GET: RequestHandler = async ({ params, url, request, locals }) => {
  const denied = apiRole(locals, "read");
  if (denied instanceof Response) return denied;

  let installationId: number;
  try {
    installationId = await forge.getInstallationId(params.owner, params.repo);
  } catch (e) {
    return installationErrorResponse(params.owner, params.repo, e);
  }
  const query = new URLSearchParams();
  for (const [k, v] of url.searchParams) {
    if (ALLOWED.has(k)) query.append(k, v);
  }
  const result = await passthrough(
    await forge.installationProvider(installationId),
    installationId,
    `/repos/${params.owner}/${params.repo}/labels`,
    query,
    request.headers.get("if-none-match"),
  );
  return toResponse(result);
};
