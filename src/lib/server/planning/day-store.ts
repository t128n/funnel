/**
 * Durable day-planning state (SPEC §3).
 *
 * Four per-viewer tables — working hours, unavailable windows, day blocks and
 * the calendar feed token — keyed by `auth_user.id` and never by a mirror
 * foreign key. Issue blocks carry `org/name` + issue number so they survive
 * mirror pruning; the mirror stays authoritative for titles and sizes.
 *
 * The calendar feed stores only the SHA-256 hash and the first eight characters
 * of the token. The raw secret is returned once by
 * {@link rotateCalendarFeed} and can never be read back.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import {
  stateCalendarFeed,
  stateDayBlock,
  stateUnavailableWindow,
  stateWorkHours,
} from "#lib/server/db/schema";
import type { DayWindow, WorkHours } from "#lib/planning/availability";

/** `issue` blocks carry a ref; `buffer` blocks reserve time and carry none. */
export type DayBlockKind = "issue" | "buffer";

/** A caller-supplied day block, before it is assigned an id and a date. */
export interface DayBlockInput {
  startMinute: number;
  minutes: number;
  kind: DayBlockKind;
  /** Set only for `issue` blocks. */
  org: string | null;
  /** Set only for `issue` blocks. */
  name: string | null;
  /** Set only for `issue` blocks. */
  issueNumber: number | null;
}

/** A persisted day block. */
export interface DayBlock extends DayBlockInput {
  id: string;
  /** The viewer's local day, `YYYY-MM-DD`. */
  date: string;
}

/** A window as accepted by {@link replaceWindows}; identical to a stored one. */
export type WindowInput = DayWindow;

/** The non-secret half of a calendar feed, safe to render. */
export interface CalendarFeed {
  /** First eight characters of the token, for the user to recognize it. */
  hint: string;
  createdAt: number;
}

/** A freshly rotated token. The raw `token` is never stored and never re-read. */
export interface CalendarFeedToken extends CalendarFeed {
  token: string;
}

/** The viewer a live feed token belongs to. */
export interface CalendarFeedOwner {
  userId: string;
}

function hoursColumns(hours: WorkHours) {
  return {
    timezone: hours.timezone,
    startMinute: hours.startMinute,
    endMinute: hours.endMinute,
    workDays: [...hours.workDays],
    bufferPercent: hours.bufferPercent,
  };
}

/** The viewer's stored hours, or `null` when they never saved any. */
export function readWorkHours(userId: string): WorkHours | null {
  const row = db
    .select()
    .from(stateWorkHours)
    .where(eq(stateWorkHours.userId, userId))
    .get();
  if (!row) return null;
  return {
    timezone: row.timezone,
    startMinute: row.startMinute,
    endMinute: row.endMinute,
    workDays: [...row.workDays],
    bufferPercent: row.bufferPercent,
  };
}

/** Store the viewer's hours, preserving the original `createdAt` on update. */
export function writeWorkHours(userId: string, hours: WorkHours): void {
  const now = Date.now();
  db.insert(stateWorkHours)
    .values({ userId, ...hoursColumns(hours), createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: stateWorkHours.userId,
      set: { ...hoursColumns(hours), updatedAt: now },
    })
    .run();
}

/** The viewer's unavailable windows, in a stable display order. */
export function listWindows(userId: string): DayWindow[] {
  return db
    .select()
    .from(stateUnavailableWindow)
    .where(eq(stateUnavailableWindow.userId, userId))
    .orderBy(
      asc(stateUnavailableWindow.weekday),
      asc(stateUnavailableWindow.date),
      asc(stateUnavailableWindow.startMinute),
      asc(stateUnavailableWindow.label),
    )
    .all()
    .map((row) => ({
      label: row.label,
      weekday: row.weekday,
      date: row.date,
      startMinute: row.startMinute,
      endMinute: row.endMinute,
    }));
}

/** Replace every window the viewer owns, in one transaction. */
export function replaceWindows(
  userId: string,
  windows: readonly WindowInput[],
): void {
  const now = Date.now();
  db.transaction((tx) => {
    tx.delete(stateUnavailableWindow)
      .where(eq(stateUnavailableWindow.userId, userId))
      .run();
    for (const window of windows) {
      tx.insert(stateUnavailableWindow)
        .values({
          id: randomUUID(),
          userId,
          label: window.label,
          weekday: window.weekday,
          date: window.date,
          startMinute: window.startMinute,
          endMinute: window.endMinute,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
  });
}

/**
 * Replace the viewer's hours and every window they own in one transaction
 * (SPEC §5). A failure while writing a window leaves the previous hours and
 * windows untouched.
 */
export function writeAvailability(
  userId: string,
  hours: WorkHours,
  windows: readonly WindowInput[],
): void {
  const now = Date.now();
  db.transaction((tx) => {
    tx.insert(stateWorkHours)
      .values({ userId, ...hoursColumns(hours), createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: stateWorkHours.userId,
        set: { ...hoursColumns(hours), updatedAt: now },
      })
      .run();

    tx.delete(stateUnavailableWindow)
      .where(eq(stateUnavailableWindow.userId, userId))
      .run();
    for (const window of windows) {
      tx.insert(stateUnavailableWindow)
        .values({
          id: randomUUID(),
          userId,
          label: window.label,
          weekday: window.weekday,
          date: window.date,
          startMinute: window.startMinute,
          endMinute: window.endMinute,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
  });
}

/** The viewer's blocks on `[from, to]` (inclusive), ascending by start. */
export function listDayBlocks(
  userId: string,
  from: string,
  to: string,
): DayBlock[] {
  return db
    .select()
    .from(stateDayBlock)
    .where(
      and(
        eq(stateDayBlock.userId, userId),
        gte(stateDayBlock.date, from),
        lte(stateDayBlock.date, to),
      ),
    )
    .orderBy(
      asc(stateDayBlock.date),
      asc(stateDayBlock.startMinute),
      asc(stateDayBlock.id),
    )
    .all()
    .map((row) => ({
      id: row.id,
      date: row.date,
      startMinute: row.startMinute,
      minutes: row.minutes,
      kind: row.kind === "issue" ? "issue" : "buffer",
      org: row.org,
      name: row.name,
      issueNumber: row.issueNumber,
    }));
}

/** Replace the viewer's whole day, in one transaction. */
export function replaceDayBlocks(
  userId: string,
  date: string,
  blocks: readonly DayBlockInput[],
): void {
  const now = Date.now();
  db.transaction((tx) => {
    tx.delete(stateDayBlock)
      .where(and(eq(stateDayBlock.userId, userId), eq(stateDayBlock.date, date)))
      .run();
    for (const block of blocks) {
      tx.insert(stateDayBlock)
        .values({
          id: randomUUID(),
          userId,
          date,
          startMinute: block.startMinute,
          minutes: block.minutes,
          kind: block.kind,
          org: block.org,
          name: block.name,
          issueNumber: block.issueNumber,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
  });
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Outlook appends `.ics` to the URL path; lookup ignores it. */
function normalizeToken(token: string): string {
  return token.endsWith(".ics") ? token.slice(0, -4) : token;
}

/** The non-secret calendar feed metadata, or `null` when none exists. */
export function readCalendarFeed(userId: string): CalendarFeed | null {
  const row = db
    .select({
      hint: stateCalendarFeed.tokenHint,
      createdAt: stateCalendarFeed.createdAt,
    })
    .from(stateCalendarFeed)
    .where(eq(stateCalendarFeed.userId, userId))
    .get();
  return row ? { hint: row.hint, createdAt: row.createdAt } : null;
}

/**
 * Create or rotate the viewer's feed token. 32 random bytes as base64url (43
 * characters); only its hash and hint are persisted, so the previous URL stops
 * resolving immediately.
 */
export function rotateCalendarFeed(userId: string): CalendarFeedToken {
  const token = randomBytes(32).toString("base64url");
  const hint = token.slice(0, 8);
  const hash = tokenHash(token);
  const now = Date.now();
  db.insert(stateCalendarFeed)
    .values({ userId, tokenHash: hash, tokenHint: hint, createdAt: now })
    .onConflictDoUpdate({
      target: stateCalendarFeed.userId,
      set: { tokenHash: hash, tokenHint: hint, createdAt: now },
    })
    .run();
  return { token, hint, createdAt: now };
}

/** Revoke the viewer's feed. Idempotent. */
export function revokeCalendarFeed(userId: string): void {
  db.delete(stateCalendarFeed)
    .where(eq(stateCalendarFeed.userId, userId))
    .run();
}

/** The owner of a live token (a trailing `.ics` is ignored), or `null`. */
export function findCalendarFeed(token: string): CalendarFeedOwner | null {
  const normalized = normalizeToken(token);
  if (normalized.length === 0) return null;
  const row = db
    .select({ userId: stateCalendarFeed.userId })
    .from(stateCalendarFeed)
    .where(eq(stateCalendarFeed.tokenHash, tokenHash(normalized)))
    .get();
  return row ? { userId: row.userId } : null;
}
