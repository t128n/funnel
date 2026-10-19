/**
 * Durable, derived issue priority.
 *
 * Priority is no longer a GitHub label. The two triage axes (impact and
 * urgency) and the P0–P3 value they derive live in `state_issue_priority`,
 * keyed by `org/name` + issue number like work notes and attachments. That
 * keeps them when the disposable mirror is pruned or rebuilt, and it means a
 * re-sync never overwrites a triager's assessment with an old label.
 *
 * Seeding is deliberately one-way: a missing row may be filled from the
 * issue's retired `p1`–`p3` label (the migration path) or from the body
 * metadata written by the scale work, but an existing row is never replaced.
 */
import { and, eq } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import { stateIssuePriority } from "#lib/server/db/schema";
import { readPriorityInputs } from "#lib/funnel-metadata";
import {
  derivePriorityOrNull,
  isPriority,
  legacyPriorityFromLabels,
  parseImpact,
  parseUrgency,
  retiredPriority,
  type Impact,
  type Priority,
  type Urgency,
} from "#lib/priority";

type PriorityRow = typeof stateIssuePriority.$inferSelect;

/** The derived priority and the inputs it came from. */
export interface PriorityState {
  impact: Impact | null;
  urgency: Urgency | null;
  /** `P0`–`P3`, or `null` when neither axis has been assessed. */
  priority: Priority | null;
  createdAt: number;
  updatedAt: number;
}

export interface PriorityInputs {
  impact: Impact | null;
  urgency: Urgency | null;
}

/** Coerce a stored/metadata priority (`P1`, `p1`, …) to the canonical form. */
export function parsePriority(value: unknown): Priority | null {
  if (isPriority(value)) return value;
  return retiredPriority(value);
}

function toState(row: PriorityRow): PriorityState {
  return {
    impact: parseImpact(row.impact),
    urgency: parseUrgency(row.urgency),
    priority: parsePriority(row.priority),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** The issue's durable priority row, if it has one. */
export function getPriorityState(
  org: string,
  name: string,
  issueNumber: number,
): PriorityState | undefined {
  const row = db
    .select()
    .from(stateIssuePriority)
    .where(
      and(
        eq(stateIssuePriority.org, org),
        eq(stateIssuePriority.name, name),
        eq(stateIssuePriority.issueNumber, issueNumber),
      ),
    )
    .get();
  return row ? toState(row) : undefined;
}

function write(
  org: string,
  name: string,
  issueNumber: number,
  inputs: PriorityInputs,
): PriorityState {
  const now = Date.now();
  const impact = parseImpact(inputs.impact);
  const urgency = parseUrgency(inputs.urgency);
  const priority = derivePriorityOrNull(impact, urgency);
  db.insert(stateIssuePriority)
    .values({
      org,
      name,
      issueNumber,
      impact,
      urgency,
      priority,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        stateIssuePriority.org,
        stateIssuePriority.name,
        stateIssuePriority.issueNumber,
      ],
      set: { impact, urgency, priority, updatedAt: now },
    })
    .run();
  return getPriorityState(org, name, issueNumber) as PriorityState;
}

/**
 * Set one or both axes and persist the derived priority. Clearing both axes
 * keeps the row (with a null priority) so a later sync cannot resurrect a
 * retired label; the cockpit renders that state as "No priority".
 */
export function setPriorityInputs(
  org: string,
  name: string,
  issueNumber: number,
  inputs: PriorityInputs,
): PriorityState {
  return write(org, name, issueNumber, inputs);
}

/**
 * Insert a row only when none exists. Used by the legacy-label migration and
 * the first-sight seed; returns `undefined` when there is nothing to seed.
 */
export function seedPriorityState(
  org: string,
  name: string,
  issueNumber: number,
  inputs: PriorityInputs & { priority?: unknown },
): PriorityState | undefined {
  const existing = getPriorityState(org, name, issueNumber);
  if (existing) return existing;

  const impact = parseImpact(inputs.impact);
  const urgency = parseUrgency(inputs.urgency);
  const seeded = parsePriority(inputs.priority);
  if (impact === null && urgency === null && seeded === null) return undefined;

  const priority =
    impact === null && urgency === null
      ? seeded
      : derivePriorityOrNull(impact, urgency);
  const now = Date.now();
  db.insert(stateIssuePriority)
    .values({
      org,
      name,
      issueNumber,
      impact,
      urgency,
      priority,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return getPriorityState(org, name, issueNumber);
}

/**
 * First-sight seed for a mirrored issue: body metadata (the impact/urgency
 * scale work) wins over the retired label. A no-op once a durable row exists.
 */
export function ensurePrioritySeeded(
  org: string,
  name: string,
  issueNumber: number,
  options: {
    labels?: readonly string[];
    legacyPriority?: unknown;
    body?: string | null;
  } = {},
): PriorityState | undefined {
  const existing = getPriorityState(org, name, issueNumber);
  if (existing) return existing;

  const axes = options.body
    ? readPriorityInputs(options.body)
    : { impact: null, urgency: null };
  return seedPriorityState(org, name, issueNumber, {
    impact: axes.impact,
    urgency: axes.urgency,
    priority:
      parsePriority(options.legacyPriority) ??
      legacyPriorityFromLabels(options.labels ?? []),
  });
}

/**
 * Whether a retired p-label disagrees with the issue's durable priority. Such
 * a label is never trusted; the mirror's `labelConflict` flag surfaces it in
 * the cockpit. Matching labels are simply stale and stay quiet.
 */
export function retiredPriorityConflict(
  org: string,
  name: string,
  issueNumber: number,
  labels: readonly string[],
): boolean {
  const present = labels.filter((label) => retiredPriority(label) !== null);
  if (present.length === 0) return false;
  // More than one retired label is itself ambiguous; never trust either.
  if (present.length > 1) return true;
  const legacy = legacyPriorityFromLabels(labels);
  if (legacy === null) return false;
  const state = getPriorityState(org, name, issueNumber);
  if (!state) return false;
  return state.priority !== legacy;
}
