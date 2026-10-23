import * as v from "valibot";
import type { RequestHandler } from "./$types";
import {
  authenticateWrite,
  issueNumberParam,
  readJson,
  scheduleRefresh,
} from "#lib/server/issues/http";
import { addIssueLabels } from "#lib/server/issues/mutations";
import { outcomeResponse } from "#lib/server/http/outcome";

/** Add labels to an issue with the signed-in user's token (SPEC §5.2.5). */
const addSchema = v.object({
  labels: v.pipe(
    v.array(v.pipe(v.string(), v.trim(), v.nonEmpty())),
    v.minLength(1, "At least one label is required"),
  ),
});

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const auth = await authenticateWrite(locals);
  if (!auth.ok) return auth.response;

  const number = issueNumberParam(params.number);
  if (number instanceof Response) return number;

  const read = await readJson(request);
  if (!read.ok) return read.response;

  const parsed = v.safeParse(addSchema, read.body);
  if (!parsed.success) {
    return Response.json(
      {
        message: "Invalid labels",
        issues: parsed.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  const result = await addIssueLabels({
    provider: auth.provider,
    repo: `${params.owner}/${params.repo}`,
    number,
    labels: parsed.output.labels,
  });
  if (result.ok) {
    scheduleRefresh(params.owner, params.repo, number, locals.user?.id);
  }
  return outcomeResponse(result, 201);
};
