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

/**
 * Stage a new submission. The id is an opaque UUID handed back to the
 * submitter (`201 {"id": "..."}`); `createdAt` is unix milliseconds, matching
 * every other timestamp in the database.
 */
export function createSubmission(input: CreateSubmissionInput): { id: string } {
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
