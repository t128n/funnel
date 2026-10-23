import * as v from "valibot";
import type { RequestHandler } from "./$types";
import { apiRole } from "#lib/server/http/session";
import { createMilestone } from "#lib/server/issues/mutations";
import { authenticate, readJson } from "#lib/server/issues/http";
import { outcomeResponse } from "#lib/server/http/outcome";
import { createLogger } from "#lib/server/log";
import { publish } from "#lib/server/sync/events";
import { refreshRepoMilestonesBySlug } from "#lib/server/sync/worker";

const log = createLogger({ component: "milestones-api" });

/**
 * Create a milestone in one repository with the signed-in user's token.
 *
 * GitHub scopes a milestone to a single repo, so this is the "lazy create"
 * path: the Inspector creates the milestone in a repo the first time someone
 * assigns it there. A milestone that spans repositories is created once per
 * repo — there is no cross-repo milestone object.
 */
const createSchema = v.object({
  title: v.pipe(
    v.string("Title must be a string"),
    v.trim(),
    v.nonEmpty("Title is required"),
    v.maxLength(256, "Title must be at most 256 characters"),
  ),
  description: v.optional(v.pipe(v.string(), v.maxLength(65536)), ""),
  dueOn: v.optional(
    v.nullable(
      v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/, "Due date must be YYYY-MM-DD")),
    ),
  ),
});

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const denied = apiRole(locals, "write");
  if (denied instanceof Response) return denied;

  const auth = await authenticate(locals.user?.id);
  if (!auth.ok) return auth.response;

  const read = await readJson(request);
  if (!read.ok) return read.response;

  const parsed = v.safeParse(createSchema, read.body);
  if (!parsed.success) {
    return Response.json(
      {
        message: "Invalid milestone",
        issues: parsed.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  const owner = params.owner;
  const repo = params.repo;
  const result = await createMilestone({
    provider: auth.provider,
    repo: `${owner}/${repo}`,
    title: parsed.output.title,
    description: parsed.output.description,
    dueOn: parsed.output.dueOn,
  });

  // Mirror the new milestone before publishing the SSE signal, so a cockpit
  // refetch lists it immediately. Failures are non-fatal (the next poll
  // converges), but the signal still fires so clients refetch.
  if (result.ok) {
    void refreshRepoMilestonesBySlug(owner, repo)
      .catch((error) => {
        log.warn(
          { repo: `${owner}/${repo}`, err: error instanceof Error ? error.message : String(error) },
          "post-create milestone refresh failed",
        );
      })
      .finally(() => {
        publish({ type: "issues", repo: `${owner}/${repo}`, numbers: [] });
      });
  }

  return outcomeResponse(result, 201);
};
