/**
 * Staging store for Funnel-first intake (SPEC §6).
 *
 * External submissions (`POST /api/intake`) land in `state_intake_submission`
 * and stay there until a triager decides. Every decision archives the row
 * (`archived_at`): the pending queue only reads rows without it, while the
 * archive keeps the dismiss reason and duplicate target. The append-only
 * decision history lives in `state_triage_event` (`./events`).
 *
 * This module is deliberately thin: reads for the Inbox/filter layer live in
 * `#lib/server/issues/queries`, so only staging primitives live here.
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import { stateIntakeSubmission } from "#lib/server/db/schema";
import { createLogger } from "#lib/server/log";
import { notifyNewIntake } from "#lib/server/notifications/service";
import { readSettings } from "#lib/server/settings/store";
import { submissionSnoozeClause } from "#lib/server/snooze";

const log = createLogger({ component: "intake" });

type IntakeNotice = (submission: { id: string; title: string }) => number;

/**
 * Whether a new submission should notify admins (default true). The master
 * notification switch wins: turning it off suppresses every kind, including
 * new-intake notices.
 */
function newIntakeEnabled(): boolean {
  try {
    const notifications = readSettings().notifications;
    return notifications.enabled && notifications.new_intake;
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
  archivedAt: number | null;
  dismissReason: string | null;
  duplicateRepo: string | null;
  duplicateNumber: number | null;
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

  // Deliberately id/source only: the queue is external-facing and the title or
  // body must never land in a log sink.
  log.info({ id, source: input.source ?? null }, "intake submission staged");

  const notify = deps.notifyNewIntake ?? notifyNewIntake;
  const enabled = deps.enabled ?? newIntakeEnabled;
  if (notify && enabled()) {
    try {
      notify({ id, title: input.title });
    } catch (error) {
      log.warn({ id, err: error }, "new-intake notification failed");
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

/**
 * Pending submissions, newest first (the Inbox stream; SPEC §2.1). A
 * submission with an active snooze is omitted until `snoozed_until` passes.
 */
export function listSubmissions(now = Date.now()): StagedSubmission[] {
  return db
    .select()
    .from(stateIntakeSubmission)
    .where(
      and(
        isNull(stateIntakeSubmission.archivedAt),
        submissionSnoozeClause(now),
      ),
    )
    // `rowid` breaks same-millisecond ties so ordering is deterministic.
    .orderBy(desc(stateIntakeSubmission.createdAt), sql`rowid desc`)
    .all();
}

/** Archived submissions, newest first (local history; not the pending queue). */
export function listArchivedSubmissions(): StagedSubmission[] {
  return db
    .select()
    .from(stateIntakeSubmission)
    .where(sql`${stateIntakeSubmission.archivedAt} IS NOT NULL`)
    .orderBy(desc(stateIntakeSubmission.createdAt), sql`rowid desc`)
    .all();
}

/**
 * Number of pending submissions matching `search`, counted in SQL so the Inbox
 * badge never materialises the queue (plan T4). Matching mirrors
 * `matchesSearch` in the query layer: a case-insensitive substring over title
 * or body, with `%`/`_` treated literally (`instr`, not `LIKE`). Active snoozes
 * are excluded, so the badge agrees with the queue.
 */
export function countPendingSubmissions(
  search = "",
  now = Date.now(),
): number {
  const needle = search.toLowerCase();
  const pending = and(
    isNull(stateIntakeSubmission.archivedAt),
    submissionSnoozeClause(now),
  );
  const where =
    needle.length === 0
      ? pending
      : and(
          pending,
          sql`(instr(lower(${stateIntakeSubmission.title}), ${needle}) > 0
              OR instr(lower(${stateIntakeSubmission.body}), ${needle}) > 0)`,
        );
  const row = db
    .select({ value: sql<number>`count(*)` })
    .from(stateIntakeSubmission)
    .where(where)
    .get();
  return Number(row?.value ?? 0);
}

/** Fields a triage decision records on the archived submission row. */
export interface ArchivePatch {
  dismissReason?: string | null;
  duplicateRepo?: string | null;
  duplicateNumber?: number | null;
}

/**
 * Archive a pending submission, recording the decision fields the archive
 * shows. Returns whether a pending row was actually archived; an already
 * archived row is left untouched.
 */
export function archiveSubmission(
  id: string,
  patch: ArchivePatch = {},
  archivedAt = Date.now(),
): boolean {
  const result = db
    .update(stateIntakeSubmission)
    .set({
      archivedAt,
      ...(patch.dismissReason !== undefined
        ? { dismissReason: patch.dismissReason }
        : {}),
      ...(patch.duplicateRepo !== undefined
        ? { duplicateRepo: patch.duplicateRepo }
        : {}),
      ...(patch.duplicateNumber !== undefined
        ? { duplicateNumber: patch.duplicateNumber }
        : {}),
    })
    .where(
      and(
        eq(stateIntakeSubmission.id, id),
        isNull(stateIntakeSubmission.archivedAt),
      ),
    )
    .run();
  return result.changes > 0;
}

/**
 * Restore a dismissed submission to the pending queue. The dismiss reason is
 * cleared from the row; the event history keeps the original reason.
 */
export function restoreSubmission(id: string): boolean {
  const result = db
    .update(stateIntakeSubmission)
    .set({ archivedAt: null, dismissReason: null })
    .where(
      and(
        eq(stateIntakeSubmission.id, id),
        sql`${stateIntakeSubmission.archivedAt} IS NOT NULL`,
      ),
    )
    .run();
  return result.changes > 0;
}

/** Hard-delete a staged row. Reserved for explicit cleanup/tests, not triage. */
export function deleteSubmission(id: string): boolean {
  const result = db
    .delete(stateIntakeSubmission)
    .where(eq(stateIntakeSubmission.id, id))
    .run();
  return result.changes > 0;
}
