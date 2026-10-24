import * as v from "valibot";
import type { RequestHandler } from "./$types";
import { setEpicChildren } from "#lib/server/epics/mutations";
import { outcomeResponse } from "#lib/server/http/outcome";
import {
  authenticateWrite,
  issueNumberParam,
  readJson,
  scheduleRefresh,
} from "#lib/server/issues/http";

/** Replace an epic's ordered child list by editing the issue body. */
const bodySchema = v.object({
  children: v.array(v.pipe(v.string(), v.trim(), v.nonEmpty())),
});

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
        message: "Invalid epic children",
        issues: parsed.issues.map((issue) => issue.message),
      },
      { status: 400 },
    );
  }

  const result = await setEpicChildren({
    provider: auth.provider,
    repo: `${params.owner}/${params.repo}`,
    number,
    children: parsed.output.children,
  });
  if (result.ok) {
    scheduleRefresh(params.owner, params.repo, number, locals.user?.id);
  }
  return outcomeResponse(result);
};
