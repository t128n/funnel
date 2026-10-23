import type { RequestHandler } from "./$types";
import { repoGet } from "#lib/server/github/app.server";
import { apiRole } from "#lib/server/http/session";

/** Mirrors `GET /repos/{owner}/{repo}/labels`. */
const ALLOWED = new Set(["per_page", "page"]);

export const GET: RequestHandler = async ({ params, request, locals }) => {
  const denied = apiRole(locals, "read");
  if (denied instanceof Response) return denied;

  return repoGet(
    params,
    request,
    `/repos/${params.owner}/${params.repo}/labels`,
    { query: ALLOWED },
  );
};
