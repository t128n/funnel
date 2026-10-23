import type { RequestHandler } from "./$types";
import { repoGet } from "#lib/server/github/app.server";
import { apiRole } from "#lib/server/http/session";

/** Mirrors `GET /repos/{owner}/{repo}/labels/{name}`. */
export const GET: RequestHandler = async ({ params, request, locals }) => {
  const denied = apiRole(locals, "read");
  if (denied instanceof Response) return denied;

  const path = `${params.owner}/${params.repo}/labels/${encodeURIComponent(params.name)}`;
  return repoGet(params, request, `/repos/${path}`, { fallbackPath: path });
};
