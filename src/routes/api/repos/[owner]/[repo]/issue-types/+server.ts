import type { RequestHandler } from "./$types";
import { forge } from "#lib/server/forge/providers.server";
import { authenticate } from "#lib/server/issues/http";
import { apiRole } from "#lib/server/http/session";
import { createLogger, errorFields } from "#lib/server/log";

const log = createLogger({ component: "issue-types-api" });

/**
 * The GitHub issue types a repository offers, using the signed-in user's
 * token. Issue types are not available on every host or repository, so an
 * unsupported feature (or any provider rejection) is reported as an empty list
 * rather than an error: callers only need to know whether to show a picker.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  const denied = apiRole(locals, "read");
  if (denied instanceof Response) return denied;

  const auth = await authenticate(locals.user?.id);
  if (!auth.ok) return auth.response;

  const repo = `${params.owner}/${params.repo}`;
  try {
    const types = await auth.provider.repos.issueTypes(
      forge.repoRef(params.owner, params.repo),
    );
    return Response.json({
      types: types.map((type) => ({
        id: type.id,
        name: type.name,
        colour: type.colour ?? "",
      })),
    });
  } catch (error) {
    log.warn(
      { repo, ...errorFields(error) },
      "issue types unavailable; returning an empty list",
    );
    return Response.json({ types: [] });
  }
};
