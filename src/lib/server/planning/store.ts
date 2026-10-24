/**
 * Durable plan items (`state_plan_item`).
 *
 * A plan item schedules exactly one mirrored issue to one ISO Monday week.
 * Rows are keyed by `(org, name, issue_number)` — never by a mirror id — so they
 * survive mirror pruning and {@link clearMirror}. GitHub stays authoritative for
 * the issue's size, assignees, state and milestone: planned hours are always
 * derived from the current mirror row, never copied into this table.
 *
 * These are the persistence primitives; cap enforcement and event publishing
 * live in `planning/mutations.ts`.
 */
import { and, asc, eq, gte, lte, type SQL } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import { statePlanItem } from "#lib/server/db/schema";

/** One durable scheduling row. `weekStart` is a Monday `YYYY-MM-DD` date. */
export interface PlanItemRecord {
  org: string;
  name: string;
  issueNumber: number;
  weekStart: string;
  /** Unix milliseconds; preserved when the item moves weeks. */
  createdAt: number;
  updatedAt: number;
}

/** The identity of a plan item (one issue). */
export interface PlanItemKey {
  org: string;
  name: string;
  issueNumber: number;
}

export interface SetPlanItemInput extends PlanItemKey {
  weekStart: string;
}

/** Filters accepted by {@link listPlanItems}. */
export interface PlanItemFilter {
  weekStart?: string;
  /** Inclusive lower bound on `weekStart`. */
  from?: string;
  /** Inclusive upper bound on `weekStart`. */
  to?: string;
  org?: string;
  name?: string;
}

type PlanRow = typeof statePlanItem.$inferSelect;

function toRecord(row: PlanRow): PlanItemRecord {
  return {
    org: row.org,
    name: row.name,
    issueNumber: row.issueNumber,
    weekStart: row.weekStart,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Every plan item, optionally narrowed by week, date range or repository.
 * Ordered by week then repository and issue number so callers get a stable
 * sequence for grouping.
 */
export function listPlanItems(filter: PlanItemFilter = {}): PlanItemRecord[] {
  const clauses: SQL[] = [];
  if (filter.weekStart !== undefined) {
    clauses.push(eq(statePlanItem.weekStart, filter.weekStart));
  }
  if (filter.from !== undefined) {
    clauses.push(gte(statePlanItem.weekStart, filter.from));
  }
  if (filter.to !== undefined) {
    clauses.push(lte(statePlanItem.weekStart, filter.to));
  }
  if (filter.org !== undefined) clauses.push(eq(statePlanItem.org, filter.org));
  if (filter.name !== undefined) {
    clauses.push(eq(statePlanItem.name, filter.name));
  }

  const where = clauses.length > 0 ? and(...clauses) : undefined;
  return db
    .select()
    .from(statePlanItem)
    .where(where)
    .orderBy(
      asc(statePlanItem.weekStart),
      asc(statePlanItem.org),
      asc(statePlanItem.name),
      asc(statePlanItem.issueNumber),
    )
    .all()
    .map(toRecord);
}

/** The plan item for one issue, or `undefined` when it is unscheduled. */
export function getPlanItem(
  org: string,
  name: string,
  issueNumber: number,
): PlanItemRecord | undefined {
  const row = db
    .select()
    .from(statePlanItem)
    .where(
      and(
        eq(statePlanItem.org, org),
        eq(statePlanItem.name, name),
        eq(statePlanItem.issueNumber, issueNumber),
      ),
    )
    .get();
  return row ? toRecord(row) : undefined;
}

/**
 * Schedule (or move) an issue to `weekStart`. The primary key makes this an
 * upsert: one issue always has at most one row, and moving weeks keeps the
 * original `createdAt`. Returns the stored row.
 */
export function setPlanItem(input: SetPlanItemInput): PlanItemRecord {
  const now = Date.now();
  db.insert(statePlanItem)
    .values({
      org: input.org,
      name: input.name,
      issueNumber: input.issueNumber,
      weekStart: input.weekStart,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        statePlanItem.org,
        statePlanItem.name,
        statePlanItem.issueNumber,
      ],
      set: { weekStart: input.weekStart, updatedAt: now },
    })
    .run();
  return getPlanItem(input.org, input.name, input.issueNumber) as PlanItemRecord;
}

/** Remove an issue's plan item. Idempotent: `false` when nothing was stored. */
export function clearPlanItem(
  org: string,
  name: string,
  issueNumber: number,
): boolean {
  return (
    db
      .delete(statePlanItem)
      .where(
        and(
          eq(statePlanItem.org, org),
          eq(statePlanItem.name, name),
          eq(statePlanItem.issueNumber, issueNumber),
        ),
      )
      .run().changes > 0
  );
}
