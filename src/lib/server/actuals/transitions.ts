/**
 * Observed workflow transitions (SPEC §1, §2).
 *
 * Sync compares the previous mirror snapshot with the hydrated issue and
 * appends one durable `state_issue_event` row per changed dimension. A first
 * sighting writes baselines (from_value = null) so tracking starts at that
 * moment; there is no backfill from the forge timeline.
 *
 * The blocked flag also drives automatic delays: adding it opens a delay with
 * the reason from the issue body's `funnel_metadata`, removing it closes the
 * open delay, and closing the issue closes every open delay. Reopening a
 * still-blocked issue starts a new blocked delay.
 */
import { readBlocked } from "#lib/funnel-metadata";
import { db } from "#lib/server/db/index";
import { stateIssueEvent } from "#lib/server/db/schema";
import type { DelayReason } from "./reasons";
import { closeOpenDelays, openDelay } from "./store";

/** The three observed dimensions the recorder diffs. */
export interface IssueTransitionSnapshot {
  status: string;
  state: string;
  blocked: boolean;
}

export interface RecordIssueTransitionsInput {
  org: string;
  name: string;
  issueNumber: number;
  /** `null` on first sighting. */
  previous: IssueTransitionSnapshot | null;
  next: IssueTransitionSnapshot;
  /** The hydrated issue body; supplies the automatic delay reason. */
  body: string;
  /** Observation timestamp (unix ms). */
  at: number;
  /** The forge's close time, when known; otherwise the close event's `at`. */
  closedAt?: number | null;
  /** `sync` for observed changes; `migration` for seeded baselines. */
  source?: string;
}

type EventKind = "status" | "state" | "blocked";

/** An unset status is stored as SQL NULL, not an empty string. */
function eventValue(value: string): string | null {
  return value.length === 0 ? null : value;
}

function blockedValue(value: boolean): string {
  return value ? "true" : "false";
}

function appendEvent(
  input: RecordIssueTransitionsInput,
  kind: EventKind,
  fromValue: string | null,
  toValue: string | null,
): void {
  db.insert(stateIssueEvent)
    .values({
      id: crypto.randomUUID(),
      org: input.org,
      name: input.name,
      issueNumber: input.issueNumber,
      kind,
      fromValue,
      toValue,
      at: input.at,
      source: input.source ?? "sync",
    })
    .run();
}

/** The structured block reason, defaulting to `other` for legacy bodies. */
function bodyReason(body: string): DelayReason {
  return readBlocked(body).info?.reason ?? "other";
}

function openBlockedDelay(input: RecordIssueTransitionsInput): void {
  openDelay({
    org: input.org,
    name: input.name,
    issueNumber: input.issueNumber,
    reason: bodyReason(input.body),
    startedAt: input.at,
  });
}

/**
 * Append the events (if any) for one observation and maintain automatic
 * delays. Idempotent when nothing changed: no rows are written and no delay is
 * opened or closed.
 */
export function recordIssueTransitions(
  input: RecordIssueTransitionsInput,
): void {
  const { previous, next } = input;

  if (!previous) {
    appendEvent(input, "status", null, eventValue(next.status));
    appendEvent(input, "state", null, eventValue(next.state));
    appendEvent(input, "blocked", null, blockedValue(next.blocked));
    // A first sighting starts the clock now; a closed issue has nothing to
    // delay, so only an open blocked issue opens a delay.
    if (next.blocked && next.state !== "closed") openBlockedDelay(input);
    return;
  }

  if (previous.status !== next.status) {
    appendEvent(
      input,
      "status",
      eventValue(previous.status),
      eventValue(next.status),
    );
  }
  if (previous.state !== next.state) {
    appendEvent(
      input,
      "state",
      eventValue(previous.state),
      eventValue(next.state),
    );
  }
  if (previous.blocked !== next.blocked) {
    appendEvent(
      input,
      "blocked",
      blockedValue(previous.blocked),
      blockedValue(next.blocked),
    );
  }

  const closedNow = previous.state !== "closed" && next.state === "closed";
  const reopened = previous.state === "closed" && next.state !== "closed";
  const unblocked = previous.blocked && !next.blocked;

  if (closedNow) {
    closeOpenDelays(
      input.org,
      input.name,
      input.issueNumber,
      input.closedAt ?? input.at,
    );
    return;
  }
  if (unblocked) {
    closeOpenDelays(input.org, input.name, input.issueNumber, input.at);
  }
  const opensDelay =
    next.state !== "closed" && next.blocked && (reopened || !previous.blocked);
  if (opensDelay) openBlockedDelay(input);
}
