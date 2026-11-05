/**
 * Durable "waiting" state (`state_issue_waiting`, issue #32).
 *
 * An issue can be parked on someone else — the reporter, a vendor or an
 * upstream project — without touching GitHub. This is deliberately *not* the
 * blocked state: blocking means work is in flight but held up, while waiting
 * means no work is possible until the other party responds. The row is keyed
 * by `owner/name` plus issue number rather than a mirror foreign key, so it
 * survives mirror pruning and a re-sync.
 *
 * Nothing here writes to the issue body. The previous blocked envelope
 * (`funnel_metadata`) remains the only structured body metadata Funnel writes,
 * and waiting is intentionally not added to it.
 */
import { and, asc, eq } from "drizzle-orm";
import { isValidISODate } from "#lib/attention";
import { db } from "#lib/server/db/index";
import { stateIssueWaiting } from "#lib/server/db/schema";
import { isRepoSlug } from "#lib/server/snooze";
import type { Outcome } from "#lib/server/http/outcome";
import {
  isWaitingReason,
  isWaitingStale,
  WAITING_REASONS,
  WAITING_STALE_DAYS,
  waitingDays,
  type WaitingReason,
} from "#lib/waiting";

export {
  isWaitingStale,
  WAITING_REASON_LABELS,
  WAITING_REASONS,
  WAITING_STALE_DAYS,
  waitingDays,
  waitingReasonLabel,
  type WaitingReason,
} from "#lib/waiting";

/** Longest free-text note accepted alongside a waiting reason. */
export const MAX_WAITING_NOTE_LENGTH = 2000;

/** One stored waiting row. */
export interface WaitingRow {
  /** `owner/name` of the repository. */
  repo: string;
  number: number;
  reason: WaitingReason;
  note: string | null;
  /** Unix ms when the wait began; preserved when only the reason changes. */
  waitingSince: number;
  /** `YYYY-MM-DD`, or `null` when no re-check date was set. */
  recheckOn: string | null;
  actorUserId: string | null;
}

/** A waiting row with the derived stale flag used by Attention. */
export interface WaitingEntry extends WaitingRow {
  stale: boolean;
  /** Whole calendar days waited. */
  days: number;
}

/** Caller-supplied fields for {@link setWaiting}. */
export interface SetWaitingInput {
  reason: string;
  note?: string | null;
  recheckOn?: string | null;
}

interface ValidatedWaitingInput {
  reason: WaitingReason;
  note: string | null;
  recheckOn: string | null;
}

type WaitingTableRow = typeof stateIssueWaiting.$inferSelect;

function toRow(row: WaitingTableRow): WaitingRow {
  return {
    repo: row.repo,
    number: row.number,
    reason: isWaitingReason(row.reason) ? row.reason : "other",
    note: row.note,
    waitingSince: row.waitingSince,
    recheckOn: row.recheckOn,
    actorUserId: row.actorUserId,
  };
}

function entry(
  row: WaitingRow,
  now: number,
  thresholdDays: number,
): WaitingEntry {
  return {
    ...row,
    stale: isWaitingStale(row, now, thresholdDays),
    days: waitingDays(row, now),
  };
}

function validNumber(number: number): boolean {
  return Number.isInteger(number) && number > 0;
}

/**
 * Validate the reason, note and optional re-check date. Unknown reasons and
 * malformed calendar dates are rejected rather than silently normalised; the
 * note is trimmed and an empty note becomes `null`.
 */
export function validateWaitingInput(
  input: SetWaitingInput,
): Outcome<ValidatedWaitingInput> {
  if (!isWaitingReason(input.reason)) {
    return { ok: false, status: 400, message: "Invalid waiting reason" };
  }

  let note: string | null = null;
  if (input.note !== undefined && input.note !== null) {
    if (typeof input.note !== "string") {
      return { ok: false, status: 400, message: "Waiting note must be text" };
    }
    const trimmed = input.note.trim();
    if (trimmed.length > MAX_WAITING_NOTE_LENGTH) {
      return {
        ok: false,
        status: 400,
        message: `Waiting note must be at most ${MAX_WAITING_NOTE_LENGTH} characters`,
      };
    }
    note = trimmed.length > 0 ? trimmed : null;
  }

  let recheckOn: string | null = null;
  if (input.recheckOn !== undefined && input.recheckOn !== null) {
    if (
      typeof input.recheckOn !== "string" ||
      !isValidISODate(input.recheckOn.trim())
    ) {
      return {
        ok: false,
        status: 400,
        message: "Re-check date must be a real YYYY-MM-DD date",
      };
    }
    recheckOn = input.recheckOn.trim();
  }

  return {
    ok: true,
    value: { reason: input.reason, note, recheckOn },
  };
}

/**
 * Persist (or replace) an issue's waiting state. Re-setting an issue keeps the
 * original `waitingSince`, so revising the reason or date does not reset the
 * stale clock; clearing and setting again does.
 */
export function setWaiting(
  repo: string,
  number: number,
  input: SetWaitingInput,
  actorUserId: string | null = null,
  now = Date.now(),
): Outcome<WaitingRow> {
  if (!isRepoSlug(repo)) {
    return { ok: false, status: 400, message: "Invalid repository" };
  }
  if (!validNumber(number)) {
    return { ok: false, status: 400, message: "Invalid issue number" };
  }
  const validated = validateWaitingInput(input);
  if (!validated.ok) return validated;

  const slug = repo.trim();
  const waitingSince = getWaiting(slug, number)?.waitingSince ?? now;
  const row: WaitingRow = {
    repo: slug,
    number,
    reason: validated.value.reason,
    note: validated.value.note,
    waitingSince,
    recheckOn: validated.value.recheckOn,
    actorUserId,
  };

  db.insert(stateIssueWaiting)
    .values(row)
    .onConflictDoUpdate({
      target: [stateIssueWaiting.repo, stateIssueWaiting.number],
      set: {
        reason: row.reason,
        note: row.note,
        waitingSince: row.waitingSince,
        recheckOn: row.recheckOn,
        actorUserId: row.actorUserId,
      },
    })
    .run();
  return { ok: true, value: row };
}

/** Remove an issue's waiting state. Returns whether a row was deleted. */
export function clearWaiting(repo: string, number: number): boolean {
  if (!isRepoSlug(repo) || !validNumber(number)) return false;
  const result = db
    .delete(stateIssueWaiting)
    .where(
      and(
        eq(stateIssueWaiting.repo, repo.trim()),
        eq(stateIssueWaiting.number, number),
      ),
    )
    .run();
  return result.changes > 0;
}

/** One issue's waiting row, or `undefined` when it is not waiting. */
export function getWaiting(
  repo: string,
  number: number,
): WaitingRow | undefined {
  if (!isRepoSlug(repo) || !validNumber(number)) return undefined;
  const row = db
    .select()
    .from(stateIssueWaiting)
    .where(
      and(
        eq(stateIssueWaiting.repo, repo.trim()),
        eq(stateIssueWaiting.number, number),
      ),
    )
    .get();
  return row ? toRow(row) : undefined;
}

/** Whether an issue currently has a waiting row. */
export function isWaiting(repo: string, number: number): boolean {
  return getWaiting(repo, number) !== undefined;
}

/**
 * Every waiting issue, oldest wait first. `now` drives the derived stale flag
 * and day count; `thresholdDays` lets the caller apply `attention.waiting_days`
 * while defaulting to the original seven-day rule.
 */
export function listWaiting(
  now = Date.now(),
  thresholdDays = WAITING_STALE_DAYS,
): WaitingEntry[] {
  return db
    .select()
    .from(stateIssueWaiting)
    .orderBy(
      asc(stateIssueWaiting.waitingSince),
      asc(stateIssueWaiting.repo),
      asc(stateIssueWaiting.number),
    )
    .all()
    .map((row) => entry(toRow(row), now, thresholdDays));
}
