/**
 * Manual day-plan endpoint (SPEC §5).
 *
 * `PUT /api/me/day-plan` replaces the caller's blocks for one local day.
 * A session is enough — day plans are personal, like work notes — and only the
 * caller's rows are touched. Blocks are validated by the pure day model; issue
 * blocks must reference a mirrored, open issue. Manual plans may overrun the
 * work window, so hours are deliberately not enforced here.
 */
import * as v from "valibot";
import type { RequestHandler } from "./$types";
import {
  DayBlockError,
  validateDayBlocks,
  type DayBlockInput,
} from "#lib/planning/day-plan";
import { issueRefKey } from "#lib/planning/availability";
import { isDateISO } from "#lib/time/zoned";
import { apiSession } from "#lib/server/http/session";
import { readJson } from "#lib/server/issues/http";
import { listDayBlocks, replaceDayBlocks } from "#lib/server/planning/day-store";
import { getPlanningIssue } from "#lib/server/planning/queries";

const blockSchema = v.object({
  startMinute: v.number(),
  minutes: v.number(),
  kind: v.picklist(["issue", "buffer"]),
  org: v.optional(v.nullable(v.string())),
  name: v.optional(v.nullable(v.string())),
  issueNumber: v.optional(v.nullable(v.number())),
});

const saveSchema = v.object({
  date: v.string(),
  blocks: v.array(blockSchema),
});

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

function invalid(message: string, issues?: string[]): Response {
  return json(issues === undefined ? { message } : { message, issues }, 400);
}

/** Every distinct issue ref must still exist in the mirror and be open. */
function checkRefs(blocks: readonly DayBlockInput[]): Response | null {
  const seen = new Set<string>();
  for (const block of blocks) {
    if (block.kind !== "issue") continue;
    const org = block.org as string;
    const name = block.name as string;
    const issueNumber = block.issueNumber as number;
    const key = issueRefKey(org, name, issueNumber);
    if (seen.has(key)) continue;
    seen.add(key);

    const issue = getPlanningIssue(org, name, issueNumber);
    if (!issue) return invalid(`Issue ${key} is not mirrored`);
    if (issue.state !== "open") return invalid(`Issue ${key} is closed`);
  }
  return null;
}

export const PUT: RequestHandler = async ({ request, locals }) => {
  const userId = apiSession(locals);
  if (userId instanceof Response) return userId;

  const read = await readJson(request);
  if (!read.ok) return read.response;

  const parsed = v.safeParse(saveSchema, read.body);
  if (!parsed.success) {
    return invalid(
      "Invalid day plan request",
      parsed.issues.map((issue) => issue.message),
    );
  }
  const { date } = parsed.output;
  if (!isDateISO(date)) return invalid(`Invalid date: ${date}`);

  const blocks: DayBlockInput[] = parsed.output.blocks.map((block) => ({
    startMinute: block.startMinute,
    minutes: block.minutes,
    kind: block.kind,
    org: block.org ?? null,
    name: block.name ?? null,
    issueNumber: block.issueNumber ?? null,
  }));

  let validated: DayBlockInput[];
  try {
    validated = validateDayBlocks({ date, blocks });
  } catch (error) {
    if (error instanceof DayBlockError) return invalid(error.message);
    throw error;
  }

  const refError = checkRefs(validated);
  if (refError) return refError;

  replaceDayBlocks(userId, date, validated);
  return json({ blocks: listDayBlocks(userId, date, date) }, 200);
};
