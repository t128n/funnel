/**
 * Staging store for Funnel-first intake (SPEC §6).
 *
 * External submissions (`POST /api/intake`) land in `state_intake_submission`
 * and stay there until a triager decides. The queue is strictly ephemeral
 * (INTERVIEW Q8): Accept creates the GitHub issue, Dismiss drops the row,
 * Duplicate copies the text onto an existing issue — every decision hard-deletes
 * the row. There is no trash bin and no archive; durable history lives on
 * GitHub once accepted.
 *
 * This module is deliberately thin: reads for the Inbox/filter layer land in
 * Milestone 5, so only the create/triage primitives live here.
 */
import { desc, eq, sql } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import { stateIntakeSubmission } from "#lib/server/db/schema";
import { createLogger } from "#lib/server/log";
import { notifyNewIntake } from "#lib/server/notifications/service";
import { readSettings } from "#lib/server/settings/store";

const log = createLogger({ component: "intake" });

type IntakeNotice = (submission: { id: string; title: string }) => number;

/** Whether admins still want a notice for each new submission (default true). */
function newIntakeEnabled(): boolean {
  try {
    return readSettings().notifications.new_intake;
  } catch {
    return true;
  }
}

export interface StagedSubmission {
  id: string;
  title: string;
  body: string;
  source: string | null;
  createdAt: number;
}

export interface CreateSubmissionInput {
  title: string;
  body?: string;
  source?: string | null;
}

/** Test seams for the admin notice fired after a submission lands. */
export interface CreateSubmissionDeps {
  notifyNewIntake?: IntakeNotice;
  enabled?: () => boolean;
}

/**
 * Stage a new submission. The id is an opaque UUID handed back to the
 * submitter (`201 {"id": "..."}`); `createdAt` is unix milliseconds, matching
 * every other timestamp in the database.
 *
 * After the row lands, admins are notified (unless the new-intake switch is
 * off). Delivery is best-effort: a notification failure never loses a
 * submission.
 */
export function createSubmission(
  input: CreateSubmissionInput,
  deps: CreateSubmissionDeps = {},
): { id: string } {
  const id = crypto.randomUUID();
  db.insert(stateIntakeSubmission)
    .values({
      id,
      title: input.title,
      body: input.body ?? "",
      source: input.source ?? null,
      createdAt: Date.now(),
    })
    .run();

  const notify = deps.notifyNewIntake ?? notifyNewIntake;
  const enabled = deps.enabled ?? newIntakeEnabled;
  if (notify && enabled()) {
    try {
      notify({ id, title: input.title });
    } catch (error) {
      log.warn({ err: error }, "new-intake notification failed");
    }
  }

  return { id };
}

export function getSubmission(id: string): StagedSubmission | undefined {
  return db
    .select()
    .from(stateIntakeSubmission)
    .where(eq(stateIntakeSubmission.id, id))
    .get();
}

/** Pending submissions, newest first (the Inbox stream; SPEC §2.1). */
export function listSubmissions(): StagedSubmission[] {
  return db
    .select()
    .from(stateIntakeSubmission)
    // `rowid` breaks same-millisecond ties so ordering is deterministic.
    .orderBy(desc(stateIntakeSubmission.createdAt), sql`rowid desc`)
    .all();
}

/** Hard-delete a staged row. Returns whether a row was actually removed. */
export function deleteSubmission(id: string): boolean {
  const result = db
    .delete(stateIntakeSubmission)
    .where(eq(stateIntakeSubmission.id, id))
    .run();
  return result.changes > 0;
}
