/**
 * Durable actual-time storage (SPEC §1, §2).
 *
 * `state_issue_event` is an append-only log of observed status/state/blocked
 * transitions; `state_issue_delay` holds blocked and manual delay intervals.
 * Both are keyed by `org/name` + issue number so they survive mirror pruning.
 *
 * Rows are written by sync (T5) and by the delay API; the arithmetic lives in
 * `./time`, so this module only validates, persists and maps rows. Automatic
 * (`source = "blocked"`) delays are never edited or deleted here: they follow
 * the issue's blocked flag.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { getConfig } from "#lib/server/config";
import { db } from "#lib/server/db/index";
import {
  mirrorRepo,
  mirrorThread,
  stateIssueDelay,
  stateIssueEvent,
} from "#lib/server/db/schema";
import { estimateMinutes } from "#lib/server/planning/capacity";
import { normalizeDelayReason, type DelayReason } from "./reasons";
import {
  computeIssueTime,
  type IssueEvent,
  type IssueTime,
} from "./time";

export type DelaySource = "blocked" | "manual";

/** One delay interval as the Inspector renders it. */
export interface DelayItem {
  id: string;
  org: string;
  name: string;
  issueNumber: number;
  reason: DelayReason;
  /** Unix milliseconds. */
  startedAt: number;
  /** `null` while the delay is still open. */
  endedAt: number | null;
  note: string;
  source: DelaySource;
}

/** The issue a delay belongs to, used to authorize and publish writes. */
export interface DelayTarget {
  org: string;
  name: string;
  issueNumber: number;
  source: DelaySource;
  startedAt: number;
  endedAt: number | null;
}

type DelayRow = typeof stateIssueDelay.$inferSelect;
type EventRow = typeof stateIssueEvent.$inferSelect;

function toDelayItem(row: DelayRow): DelayItem {
  return {
    id: row.id,
    org: row.org,
    name: row.name,
    issueNumber: row.issueNumber,
    reason: normalizeDelayReason(row.reason),
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    note: row.note,
    source: row.source === "blocked" ? "blocked" : "manual",
  };
}

function toIssueEvent(row: EventRow): IssueEvent {
  return {
    kind:
      row.kind === "status" || row.kind === "state" || row.kind === "blocked"
        ? row.kind
        : "status",
    fromValue: row.fromValue,
    toValue: row.toValue,
    at: row.at,
    source: row.source,
  };
}

function delayRow(id: string): DelayRow | undefined {
  return db
    .select()
    .from(stateIssueDelay)
    .where(eq(stateIssueDelay.id, id))
    .get();
}

/** Every observed transition for one issue, oldest first (T7 detail). */
export function listIssueEvents(
  org: string,
  name: string,
  issueNumber: number,
): IssueEvent[] {
  return db
    .select()
    .from(stateIssueEvent)
    .where(
      and(
        eq(stateIssueEvent.org, org),
        eq(stateIssueEvent.name, name),
        eq(stateIssueEvent.issueNumber, issueNumber),
      ),
    )
    .orderBy(asc(stateIssueEvent.at), asc(stateIssueEvent.id))
    .all()
    .map(toIssueEvent);
}

/** Every delay row for one issue, oldest first. */
export function listDelays(
  org: string,
  name: string,
  issueNumber: number,
): DelayItem[] {
  return db
    .select()
    .from(stateIssueDelay)
    .where(
      and(
        eq(stateIssueDelay.org, org),
        eq(stateIssueDelay.name, name),
        eq(stateIssueDelay.issueNumber, issueNumber),
      ),
    )
    .orderBy(asc(stateIssueDelay.startedAt), asc(stateIssueDelay.id))
    .all()
    .map(toDelayItem);
}

/** Look up a delay's row and ownership; `undefined` when it does not exist. */
export function delayTarget(id: string): DelayTarget | undefined {
  const row = delayRow(id);
  if (!row) return undefined;
  return {
    org: row.org,
    name: row.name,
    issueNumber: row.issueNumber,
    source: row.source === "blocked" ? "blocked" : "manual",
    startedAt: row.startedAt,
    endedAt: row.endedAt,
  };
}

export interface OpenDelayInput {
  org: string;
  name: string;
  issueNumber: number;
  reason: DelayReason;
  startedAt?: number;
  note?: string;
}

/**
 * Open an automatic (`source = "blocked"`) delay. Called by sync when the
 * blocked flag is added or the issue is reopened while blocked.
 */
export function openDelay(input: OpenDelayInput): DelayItem {
  const id = crypto.randomUUID();
  db.insert(stateIssueDelay)
    .values({
      id,
      org: input.org,
      name: input.name,
      issueNumber: input.issueNumber,
      reason: input.reason,
      startedAt: input.startedAt ?? Date.now(),
      endedAt: null,
      note: input.note ?? "",
      source: "blocked",
    })
    .run();
  return toDelayItem(delayRow(id) as DelayRow);
}

/** Close every open delay for an issue; returns how many were closed. */
export function closeOpenDelays(
  org: string,
  name: string,
  issueNumber: number,
  at: number,
): number {
  const open = db
    .select()
    .from(stateIssueDelay)
    .where(
      and(
        eq(stateIssueDelay.org, org),
        eq(stateIssueDelay.name, name),
        eq(stateIssueDelay.issueNumber, issueNumber),
        isNull(stateIssueDelay.endedAt),
      ),
    )
    .all();
  for (const row of open) {
    db.update(stateIssueDelay)
      .set({ endedAt: Math.max(at, row.startedAt) })
      .where(eq(stateIssueDelay.id, row.id))
      .run();
  }
  return open.length;
}

export interface CreateManualDelayInput {
  org: string;
  name: string;
  issueNumber: number;
  reason: DelayReason;
  startedAt?: number;
  endedAt?: number | null;
  note?: string;
}

/** Create a local-only manual delay (`source = "manual"`). */
export function createManualDelay(input: CreateManualDelayInput): DelayItem {
  const id = crypto.randomUUID();
  const startedAt = input.startedAt ?? Date.now();
  const endedAt =
    input.endedAt === null || input.endedAt === undefined
      ? null
      : Math.max(input.endedAt, startedAt);
  db.insert(stateIssueDelay)
    .values({
      id,
      org: input.org,
      name: input.name,
      issueNumber: input.issueNumber,
      reason: input.reason,
      startedAt,
      endedAt,
      note: input.note ?? "",
      source: "manual",
    })
    .run();
  return toDelayItem(delayRow(id) as DelayRow);
}

export interface UpdateDelayPatch {
  reason?: DelayReason;
  endedAt?: number | null;
  note?: string;
}

/**
 * Edit a manual delay. Returns `undefined` when the row is missing or
 * automatic; blocked delays are read-only.
 */
export function updateDelay(
  id: string,
  patch: UpdateDelayPatch,
): DelayItem | undefined {
  const row = delayRow(id);
  if (!row || row.source !== "manual") return undefined;

  const set: Partial<typeof stateIssueDelay.$inferInsert> = {};
  if (patch.reason !== undefined) set.reason = patch.reason;
  if (patch.note !== undefined) set.note = patch.note;
  if (patch.endedAt !== undefined) {
    set.endedAt =
      patch.endedAt === null ? null : Math.max(patch.endedAt, row.startedAt);
  }
  if (Object.keys(set).length > 0) {
    db.update(stateIssueDelay).set(set).where(eq(stateIssueDelay.id, id)).run();
  }
  return toDelayItem(delayRow(id) as DelayRow);
}

/** Delete a manual delay; automatic rows are read-only. */
export function deleteDelay(id: string): boolean {
  return (
    db
      .delete(stateIssueDelay)
      .where(
        and(eq(stateIssueDelay.id, id), eq(stateIssueDelay.source, "manual")),
      )
      .run().changes > 0
  );
}

/** A lookup key for {@link batchIssueTime} results. */
export function issueTimeKey(target: IssueTimeTarget): string {
  return `${target.org}/${target.name}#${target.number}`;
}

export interface IssueTimeTarget {
  org: string;
  name: string;
  number: number;
}

interface MirrorTimeSource {
  createdAt: number;
  closedAt: number | null;
  size: string | null;
}

function mirrorTimeSource(target: IssueTimeTarget): MirrorTimeSource | undefined {
  return db
    .select({
      createdAt: mirrorThread.createdAt,
      closedAt: mirrorThread.closedAt,
      size: mirrorThread.size,
    })
    .from(mirrorThread)
    .innerJoin(mirrorRepo, eq(mirrorThread.repoId, mirrorRepo.id))
    .where(
      and(
        eq(mirrorRepo.org, target.org),
        eq(mirrorRepo.name, target.name),
        eq(mirrorThread.number, target.number),
      ),
    )
    .get();
}

/**
 * Time summaries for many issues, keyed by {@link issueTimeKey}. Estimates
 * resolve through the mirror's size label and the configured size map, the
 * same way the Inspector and planner do. Unknown issues still get zeroed
 * summaries so callers can render a missing child without special-casing it.
 */
export async function batchIssueTime(
  targets: readonly IssueTimeTarget[],
): Promise<Map<string, IssueTime>> {
  const result = new Map<string, IssueTime>();
  if (targets.length === 0) return result;

  const config = await getConfig();
  const sizeMinutes = config.planning.size_minutes as Record<string, number>;
  const now = Date.now();

  for (const target of targets) {
    const key = issueTimeKey(target);
    if (result.has(key)) continue;
    const mirror = mirrorTimeSource(target);
    result.set(
      key,
      computeIssueTime({
        events: listIssueEvents(target.org, target.name, target.number),
        delays: listDelays(target.org, target.name, target.number),
        estimateMinutes: estimateMinutes(mirror?.size ?? null, sizeMinutes),
        openedAt: mirror?.createdAt ?? null,
        closedAt: mirror?.closedAt ?? null,
        now,
      }),
    );
  }
  return result;
}
