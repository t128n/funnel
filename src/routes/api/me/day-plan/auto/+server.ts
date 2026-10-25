/**
 * Automatic day-plan endpoint (SPEC §5).
 *
 * `POST /api/me/day-plan/auto` builds the caller's day from the ALPEN
 * candidates of the Monday week containing `date`, persists it and returns the
 * stored blocks. Hours resolve to the viewer's saved row, else the admin
 * `planning.work_defaults`; only this path enforces the work window and the
 * reserved buffer (the manual endpoint allows overruns).
 */
import * as v from "valibot";
import type { RequestHandler } from "./$types";
import {
  DayBlockError,
  autoDayPlan,
  validateDayBlocks,
  type DayBlockInput,
} from "#lib/planning/day-plan";
import {
  DEFAULT_WORK_HOURS,
  hoursFromDefaults,
  type WorkDefaultsInput,
  type WorkHours,
} from "#lib/planning/availability";
import { isDateISO } from "#lib/time/zoned";
import { apiSession } from "#lib/server/http/session";
import { readJson } from "#lib/server/issues/http";
import {
  listDayBlocks,
  listWindows,
  readWorkHours,
  replaceDayBlocks,
} from "#lib/server/planning/day-store";
import { listDayCandidates } from "#lib/server/planning/day-queries";
import { readSettings } from "#lib/server/settings/store";

const autoSchema = v.object({ date: v.string() });

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

function invalid(message: string, issues?: string[]): Response {
  return json(issues === undefined ? { message } : { message, issues }, 400);
}

/**
 * Admin fallback for a viewer without a stored row. T4 owns
 * `planning.work_defaults`; read it through the settings store and tolerate its
 * absence so the route works before that key ships.
 */
function defaultHours(): WorkHours {
  const planning = readSettings().planning as {
    work_defaults?: WorkDefaultsInput;
  };
  return planning.work_defaults === undefined
    ? DEFAULT_WORK_HOURS
    : hoursFromDefaults(planning.work_defaults);
}

export const POST: RequestHandler = async ({ request, locals }) => {
  const userId = apiSession(locals);
  if (userId instanceof Response) return userId;

  const read = await readJson(request);
  if (!read.ok) return read.response;

  const parsed = v.safeParse(autoSchema, read.body);
  if (!parsed.success) {
    return invalid(
      "Invalid day plan request",
      parsed.issues.map((issue) => issue.message),
    );
  }
  const { date } = parsed.output;
  if (!isDateISO(date)) return invalid(`Invalid date: ${date}`);

  const hours = readWorkHours(userId) ?? defaultHours();
  const blocks = autoDayPlan({
    date,
    hours,
    windows: listWindows(userId),
    candidates: listDayCandidates(userId, date),
  });

  let validated: DayBlockInput[];
  try {
    validated = validateDayBlocks({ date, blocks });
  } catch (error) {
    if (error instanceof DayBlockError) return invalid(error.message);
    throw error;
  }

  replaceDayBlocks(userId, date, validated);
  return json({ blocks: listDayBlocks(userId, date, date) }, 200);
};
