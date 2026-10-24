import * as v from "valibot";
import type { RequestHandler } from "./$types";
import { setEpicLabel } from "#lib/server/epics/mutations";
import { outcomeResponse } from "#lib/server/http/outcome";
import {
  authenticateWrite,
  issueNumberParam,
  readJson,
  scheduleRefresh,
} from "#lib/server/issues/http";

/** Mark or unmark an issue as an epic with the signed-in user's token. */
const bodySchema = v.object({ is_epic: v.boolean() });

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const auth = await authenticateWrite(locals);
  if (!auth.ok) return auth.response;

  const number = issueNumberParam(params.number);
  if (number instanceof Response) return number;

  const read = await readJson(request);
  if (!read.ok) return read.response;

  const parsed = v.safeParse(bodySchema, read.body);
  if (!parsed.success) {
    return Response.json(
      {
        message: "Invalid epic body",
        issues: parsed.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  const result = await setEpicLabel({
    provider: auth.provider,
    repo: `${params.owner}/${params.repo}`,
    number,
    isEpic: parsed.output.is_epic,
  });
  if (result.ok) {
    scheduleRefresh(params.owner, params.repo, number, locals.user?.id);
  }
  return outcomeResponse(result);
};
