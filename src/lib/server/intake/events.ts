/**
 * Append-only triage history for intake submissions (SPEC §6.2, issue #19).
 *
 * Every decision writes one `state_triage_event` row before (or alongside) the
 * submission row being archived. The history is keyed by submission id rather
 * than a foreign key, so it survives the submission being archived or removed.
 * There are deliberately no update/delete helpers: undo appends an `undone`
 * event and restores the submission.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import { stateTriageEvent } from "#lib/server/db/schema";

/** The four decision kinds recorded locally. */
export type TriageAction = "accepted" | "dismissed" | "duplicated" | "undone";

export interface TriageEvent {
  id: string;
  submissionId: string;
  action: TriageAction;
  actorUserId: string;
  repo: string | null;
  number: number | null;
  reason: string | null;
  createdAt: number;
}

export interface RecordTriageEventInput {
  submissionId: string;
  action: TriageAction;
  actorUserId: string;
  /** `owner/name` of the created issue or duplicate target. */
  repo?: string | null;
  number?: number | null;
  reason?: string | null;
}

/** Append one event. Returns its generated id. */
export function recordTriageEvent(input: RecordTriageEventInput): string {
  const id = crypto.randomUUID();
  db.insert(stateTriageEvent)
    .values({
      id,
      submissionId: input.submissionId,
      action: input.action,
      actorUserId: input.actorUserId,
      repo: input.repo ?? null,
      number: input.number ?? null,
      reason: input.reason ?? null,
      createdAt: Date.now(),
    })
    .run();
  return id;
}

export function getTriageEvent(id: string): TriageEvent | undefined {
  return db
    .select()
    .from(stateTriageEvent)
    .where(eq(stateTriageEvent.id, id))
    .get() as TriageEvent | undefined;
}

/** Events for one submission, oldest first (the audit trail's display order). */
export function listTriageEvents(submissionId: string): TriageEvent[] {
  return db
    .select()
    .from(stateTriageEvent)
    .where(eq(stateTriageEvent.submissionId, submissionId))
    // `rowid` keeps insertion order when two events share a millisecond.
    .orderBy(asc(stateTriageEvent.createdAt), sql`rowid asc`)
    .all() as TriageEvent[];
}

/** The newest event for one submission, or `undefined` when never triaged. */
export function latestTriageEvent(
  submissionId: string,
): TriageEvent | undefined {
  return db
    .select()
    .from(stateTriageEvent)
    .where(eq(stateTriageEvent.submissionId, submissionId))
    .orderBy(sql`rowid desc`)
    .get() as TriageEvent | undefined;
}

/**
 * The earliest `accepted` decision that created one issue, or `undefined` when
 * the issue did not come from intake. Used to add a "Created from intake"
 * entry to the issue history without duplicating the append-only log.
 */
export function findAcceptedEvent(
  repo: string,
  number: number,
): TriageEvent | undefined {
  return db
    .select()
    .from(stateTriageEvent)
    .where(
      and(
        eq(stateTriageEvent.action, "accepted"),
        eq(stateTriageEvent.repo, repo),
        eq(stateTriageEvent.number, number),
      ),
    )
    .orderBy(asc(stateTriageEvent.createdAt), sql`rowid asc`)
    .get() as TriageEvent | undefined;
}
