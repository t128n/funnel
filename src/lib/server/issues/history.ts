/**
 * Unified issue activity history.
 *
 * Three sources are merged into one chronological list:
 *
 * - the durable local `state_issue_event` log (status, state, blocked,
 *   priority, labels and assignees),
 * - the append-only intake log when the issue was accepted from a submission,
 * - mirrored GitHub timeline events for actions the local log does not already
 *   represent (references, mentions, renames, milestones).
 *
 * Comments are deliberately absent: `ActivityTimeline` already renders them
 * from `mirror_comment`, and adding them here would duplicate every comment.
 * Local `label`/`assignee`/`state` changes suppress their mirrored
 * counterparts so each real change appears exactly once.
 */
import { eq } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import { authUser } from "#lib/server/db/schema";
import { listIssueEvents } from "#lib/server/actuals/store";
import type { IssueEvent } from "#lib/server/actuals/time";
import { findAcceptedEvent } from "#lib/server/intake/events";
import {
  getIssueTimelineEvents,
  type IssueTimelineEvent,
} from "#lib/server/sync/mirror";
import type { IssueHistoryItem, UserRef } from "./types";

/** A local Funnel actor has no forge identity; these markers make that clear. */
const LOCAL_FORGE = "funnel";
const LOCAL_INSTANCE = "funnel";

function lower(value: string | null | undefined): string {
  return (value ?? "").toLowerCase();
}

function display(value: string | null): string {
  return value ?? "none";
}

/** The action a local transition row represents. */
export function localHistoryAction(event: IssueEvent): string {
  switch (event.kind) {
    case "status":
    case "priority":
      return event.fromValue === null ? "recorded" : "changed";
    case "state":
      if (event.toValue === "closed") return "closed";
      if (event.fromValue === "closed") return "reopened";
      return event.fromValue === null ? "recorded" : "changed";
    case "blocked":
      return event.toValue === "true" ? "blocked" : "unblocked";
    case "label":
      return event.toValue !== null ? "added" : "removed";
    case "assignee":
      return event.toValue !== null ? "assigned" : "unassigned";
  }
}

/** One-line, human-readable summary for a local transition row. */
export function localHistorySummary(event: IssueEvent): string {
  switch (event.kind) {
    case "status":
      return event.fromValue === null
        ? `Status recorded as ${display(event.toValue)}`
        : `Status changed from ${display(event.fromValue)} to ${display(event.toValue)}`;
    case "state":
      if (event.toValue === "closed") return "Closed this issue";
      if (event.fromValue === "closed") return "Reopened this issue";
      return event.fromValue === null
        ? `State recorded as ${display(event.toValue)}`
        : `State changed from ${display(event.fromValue)} to ${display(event.toValue)}`;
    case "blocked":
      if (event.toValue === "true") {
        return event.fromValue === null
          ? "Blocked this issue"
          : "Marked this issue blocked";
      }
      return "Unblocked this issue";
    case "priority":
      if (event.fromValue === null) {
        return `Priority recorded as ${display(event.toValue)}`;
      }
      if (event.toValue === null) return "Removed priority";
      return `Priority changed from ${event.fromValue} to ${event.toValue}`;
    case "label":
      return event.toValue !== null
        ? `Added label "${event.toValue}"`
        : `Removed label "${display(event.fromValue)}"`;
    case "assignee":
      return event.toValue !== null
        ? `Assigned @${event.toValue}`
        : `Unassigned @${display(event.fromValue)}`;
  }
}

function localHistoryItem(event: IssueEvent): IssueHistoryItem {
  return {
    id: `funnel:${event.id ?? `${event.kind}:${event.at}:${event.toValue ?? ""}`}`,
    at: event.at,
    kind: event.kind,
    action: localHistoryAction(event),
    summary: localHistorySummary(event),
    actor: null,
    source: "funnel",
  };
}

/**
 * The dedupe key mirrored events are matched against. Only the change kinds
 * the local log also records take part; every other mirrored kind (references,
 * mentions, renames, milestones) is always shown.
 */
function localDedupeKey(event: IssueEvent): string | null {
  switch (event.kind) {
    case "label":
      return event.toValue !== null
        ? `label:labelled:${lower(event.toValue)}`
        : event.fromValue !== null
          ? `label:unlabelled:${lower(event.fromValue)}`
          : null;
    case "assignee":
      return event.toValue !== null
        ? `assignment:assigned:${lower(event.toValue)}`
        : event.fromValue !== null
          ? `assignment:unassigned:${lower(event.fromValue)}`
          : null;
    case "state":
      if (event.toValue === "closed") return "state_change:closed";
      if (event.fromValue === "closed") return "state_change:reopened";
      return null;
    default:
      return null;
  }
}

/** The same key for a mirrored event, or `null` for always-visible kinds. */
function mirrorDedupeKey(event: IssueTimelineEvent): string | null {
  switch (event.kind) {
    case "label":
      return event.detail?.label
        ? `label:${event.action}:${lower(event.detail.label)}`
        : null;
    case "assignment":
      return event.detail?.assignee
        ? `assignment:${event.action}:${lower(event.detail.assignee)}`
        : null;
    case "state_change":
      return `state_change:${event.action}`;
    default:
      return null;
  }
}

function mirrorHistoryItem(event: IssueTimelineEvent): IssueHistoryItem {
  const actor: UserRef | null = event.actor
    ? {
        externalId: event.actor.externalId,
        forge: event.actor.forge,
        instance: event.actor.instance,
        login: event.actor.login,
        avatarUrl: event.actor.avatarUrl,
      }
    : null;
  return {
    id: `github:${event.id}`,
    at: event.occurredAt,
    kind: event.kind,
    action: event.action,
    summary: event.summary,
    actor,
    source: "github",
  };
}

/** Resolve a Funnel account id to a display-only `UserRef`. */
function funnelActor(userId: string): UserRef | null {
  const user = db
    .select({
      id: authUser.id,
      name: authUser.name,
      email: authUser.email,
      image: authUser.image,
    })
    .from(authUser)
    .where(eq(authUser.id, userId))
    .get();
  if (!user) return null;
  return {
    externalId: user.id,
    forge: LOCAL_FORGE,
    instance: LOCAL_INSTANCE,
    login: user.name || user.email,
    avatarUrl: user.image ?? "",
  };
}

export interface IssueHistoryInput {
  repoId: number;
  org: string;
  name: string;
  number: number;
}

/**
 * Compose the unified history for one issue. Empty data is valid and returns
 * an empty list; a missing mirrored issue is handled by `getIssueDetail`.
 */
export function listIssueHistory(input: IssueHistoryInput): IssueHistoryItem[] {
  const localEvents = listIssueEvents(input.org, input.name, input.number);
  const items = localEvents.map(localHistoryItem);

  const accepted = findAcceptedEvent(
    `${input.org}/${input.name}`,
    input.number,
  );
  if (accepted) {
    items.push({
      id: `intake:${accepted.id}`,
      at: accepted.createdAt,
      kind: "intake",
      action: "accepted",
      summary: "Created from intake",
      actor: funnelActor(accepted.actorUserId),
      source: "funnel",
    });
  }

  const localKeys = new Set(
    localEvents
      .map(localDedupeKey)
      .filter((key): key is string => key !== null),
  );
  for (const event of getIssueTimelineEvents(input.repoId, input.number)) {
    if (event.kind === "comment" || event.action.includes("comment")) continue;
    const key = mirrorDedupeKey(event);
    if (key !== null && localKeys.has(key)) continue;
    items.push(mirrorHistoryItem(event));
  }

  return items.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}
