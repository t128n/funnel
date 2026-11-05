/**
 * Durable Inbox snoozes (`state_snooze`).
 *
 * A snooze defers a staged submission or an untriaged mirrored issue without
 * archiving it or touching the mirror. Pending Inbox reads exclude rows whose
 * `snoozed_until` is still in the future and include them again automatically
 * once it passes — no background job is needed.
 *
 * Issues are keyed by `owner/name` plus number (never a mirror id), matching
 * the rest of Funnel's durable state, so a snooze survives mirror pruning and
 * a re-sync. Submissions are keyed by their staged id, which is stable for the
 * lifetime of the row.
 */
import { and, asc, eq, gt, lte, sql, type SQL } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import {
  mirrorThread,
  stateIntakeSubmission,
  stateSnooze,
} from "#lib/server/db/schema";
import type { Outcome } from "#lib/server/http/outcome";

/** Longest snooze Funnel accepts: one year from the request time. */
export const MAX_SNOOZE_HORIZON_MS = 365 * 86_400_000;

/** One durable snooze row. */
export interface SnoozeRow {
  /** `submission:<id>` or `issue:<owner/name>#<number>`. */
  key: string;
  submissionId: string | null;
  repo: string | null;
  number: number | null;
  snoozedUntil: number;
  createdAt: number;
  actorUserId: string | null;
}

type SnoozeTableRow = typeof stateSnooze.$inferSelect;

/** Stable key for a staged submission. */
export function submissionSnoozeKey(id: string): string {
  return `submission:${id}`;
}

/** Stable key for an issue, independent of the disposable mirror. */
export function issueSnoozeKey(repo: string, number: number): string {
  return `issue:${repo}#${number}`;
}

function toRow(row: SnoozeTableRow): SnoozeRow {
  return {
    key: row.key,
    submissionId: row.submissionId,
    repo: row.repo,
    number: row.number,
    snoozedUntil: row.snoozedUntil,
    createdAt: row.createdAt,
    actorUserId: row.actorUserId,
  };
}

/**
 * Validate a requested resurface time. It must be a whole millisecond
 * timestamp strictly in the future and no more than
 * {@link MAX_SNOOZE_HORIZON_MS} away, so a typo cannot hide an item for years.
 */
export function validateSnoozeUntil(
  until: number,
  now = Date.now(),
): Outcome<number> {
  if (!Number.isInteger(until) || !Number.isFinite(until)) {
    return {
      ok: false,
      status: 400,
      message: "Snooze date must be a whole millisecond timestamp",
    };
  }
  if (until <= now) {
    return {
      ok: false,
      status: 400,
      message: "Snooze date must be in the future",
    };
  }
  if (until > now + MAX_SNOOZE_HORIZON_MS) {
    return {
      ok: false,
      status: 400,
      message: "Snooze date must be within the next year",
    };
  }
  return { ok: true, value: until };
}

/** A trimmed, non-empty submission id. */
function validSubmissionId(id: string): boolean {
  return typeof id === "string" && id.trim().length > 0;
}

/** An `owner/name` slug with a non-empty owner and name. */
export function isRepoSlug(repo: string): boolean {
  if (typeof repo !== "string") return false;
  const slash = repo.indexOf("/");
  return slash > 0 && slash < repo.length - 1;
}

/**
 * Persist (or replace) a submission snooze. Returns the stored row so callers
 * can render the resurface date without a second read.
 */
export function snoozeSubmission(
  id: string,
  until: number,
  actorUserId: string | null = null,
  now = Date.now(),
): Outcome<SnoozeRow> {
  if (!validSubmissionId(id)) {
    return { ok: false, status: 400, message: "Missing submission id" };
  }
  const validated = validateSnoozeUntil(until, now);
  if (!validated.ok) return validated;

  const key = submissionSnoozeKey(id.trim());
  const row = {
    key,
    submissionId: id.trim(),
    repo: null,
    number: null,
    snoozedUntil: validated.value,
    createdAt: now,
    actorUserId,
  };
  db.insert(stateSnooze)
    .values(row)
    .onConflictDoUpdate({
      target: stateSnooze.key,
      set: {
        submissionId: row.submissionId,
        repo: null,
        number: null,
        snoozedUntil: row.snoozedUntil,
        createdAt: row.createdAt,
        actorUserId: row.actorUserId,
      },
    })
    .run();
  return { ok: true, value: row };
}

/** Persist (or replace) an issue snooze, keyed by repo slug + number. */
export function snoozeIssue(
  repo: string,
  number: number,
  until: number,
  actorUserId: string | null = null,
  now = Date.now(),
): Outcome<SnoozeRow> {
  if (!isRepoSlug(repo)) {
    return { ok: false, status: 400, message: "Invalid repository" };
  }
  if (!Number.isInteger(number) || number <= 0) {
    return { ok: false, status: 400, message: "Invalid issue number" };
  }
  const validated = validateSnoozeUntil(until, now);
  if (!validated.ok) return validated;

  const slug = repo.trim();
  const row = {
    key: issueSnoozeKey(slug, number),
    submissionId: null,
    repo: slug,
    number,
    snoozedUntil: validated.value,
    createdAt: now,
    actorUserId,
  };
  db.insert(stateSnooze)
    .values(row)
    .onConflictDoUpdate({
      target: stateSnooze.key,
      set: {
        submissionId: null,
        repo: row.repo,
        number: row.number,
        snoozedUntil: row.snoozedUntil,
        createdAt: row.createdAt,
        actorUserId: row.actorUserId,
      },
    })
    .run();
  return { ok: true, value: row };
}

/** Remove a submission snooze. Returns whether a row was deleted. */
export function clearSubmissionSnooze(id: string): boolean {
  if (!validSubmissionId(id)) return false;
  const result = db
    .delete(stateSnooze)
    .where(eq(stateSnooze.key, submissionSnoozeKey(id.trim())))
    .run();
  return result.changes > 0;
}

/** Remove an issue snooze. Returns whether a row was deleted. */
export function clearIssueSnooze(repo: string, number: number): boolean {
  if (!isRepoSlug(repo) || !Number.isInteger(number) || number <= 0) {
    return false;
  }
  const result = db
    .delete(stateSnooze)
    .where(eq(stateSnooze.key, issueSnoozeKey(repo.trim(), number)))
    .run();
  return result.changes > 0;
}

/** Every still-active snooze, earliest resurface first. */
export function activeSnoozes(now = Date.now()): SnoozeRow[] {
  return db
    .select()
    .from(stateSnooze)
    .where(gt(stateSnooze.snoozedUntil, now))
    .orderBy(asc(stateSnooze.snoozedUntil))
    .all()
    .map(toRow);
}

/** Alias used by the Snoozed view; same rows, same order. */
export function listSnoozed(now = Date.now()): SnoozeRow[] {
  return activeSnoozes(now);
}

/** Whether one submission is currently snoozed. */
export function isSubmissionSnoozed(id: string, now = Date.now()): boolean {
  if (!validSubmissionId(id)) return false;
  const row = db
    .select({ key: stateSnooze.key })
    .from(stateSnooze)
    .where(
      and(
        eq(stateSnooze.submissionId, id.trim()),
        gt(stateSnooze.snoozedUntil, now),
      ),
    )
    .get();
  return row !== undefined;
}

/** Whether one issue is currently snoozed. */
export function isIssueSnoozed(
  repo: string,
  number: number,
  now = Date.now(),
): boolean {
  if (!isRepoSlug(repo) || !Number.isInteger(number) || number <= 0) {
    return false;
  }
  const row = db
    .select({ key: stateSnooze.key })
    .from(stateSnooze)
    .where(
      and(
        eq(stateSnooze.repo, repo.trim()),
        eq(stateSnooze.number, number),
        gt(stateSnooze.snoozedUntil, now),
      ),
    )
    .get();
  return row !== undefined;
}

/**
 * Drop expired rows. Reads never depend on this, but it keeps the table from
 * accumulating one stale row per item that was snoozed once and then triaged.
 */
export function pruneExpiredSnoozes(now = Date.now()): number {
  const result = db
    .delete(stateSnooze)
    .where(lte(stateSnooze.snoozedUntil, now))
    .run();
  return result.changes;
}

/**
 * `WHERE` fragment excluding submissions with an active snooze. The identity
 * is the staged id, so pruning or re-syncing the mirror cannot affect it.
 */
export function submissionSnoozeClause(now: number): SQL {
  return sql`NOT EXISTS (
    SELECT 1 FROM ${stateSnooze} s
    WHERE s.submission_id = ${stateIntakeSubmission.id}
      AND s.snoozed_until > ${now}
  )`;
}

/**
 * `WHERE` fragment excluding mirrored issues with an active snooze. The repo
 * slug is resolved inside the subquery so the fragment also works for counts
 * that query `mirror_thread` without joining `mirror_repo`.
 */
export function issueSnoozeClause(now: number): SQL {
  return sql`NOT EXISTS (
    SELECT 1 FROM ${stateSnooze} s
    JOIN mirror_repo r ON r.id = ${mirrorThread.repoId}
    WHERE s.repo = r.org || '/' || r.name
      AND s.number = ${mirrorThread.number}
      AND s.snoozed_until > ${now}
  )`;
}
