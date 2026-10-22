/**
 * Issue actions shared by the board card menu, drag-and-drop, and the
 * structured dialogs (SPEC §5.1, §5.2.3, §9.2).
 *
 * Status writes go through the optimistic overlay, so a card lands in its new
 * column the instant the action is taken. "Done" is a *state* transition rather
 * than a label: choosing it (from the menu, the `S` shortcut, or a drop into
 * Done) raises the structured close dialog, and reopening from Done raises the
 * reopen dialog. Blocking is likewise structured — the blocker description is
 * posted as a comment and recorded in the body metadata before the flag is set.
 * One dialog set is rendered at the board level, so this module owns the
 * pending request instead of each card.
 */
import type { IssueListItem, UserRef } from "#lib/server/issues/types";
import {
  blockIssue,
  closeIssue,
  fetchIssueDetail,
  reopenIssue,
  unblockIssue,
  updateIssue,
  type CloseReason,
} from "#lib/client/mutations";
import { mutate, notifyFailure, overlayKey } from "#lib/client/optimistic.svelte";
import { writeBlocked, type BlockInfo } from "#lib/funnel-metadata";

export type ResolveMode = "close" | "reopen";
export type BlockMode = "block" | "unblock";

/** A close/reopen awaiting the structured note. */
export interface ResolvePending {
  kind: "resolve";
  issue: IssueListItem;
  mode: ResolveMode;
  /** Status to apply after a reopen note; `null` keeps the issue's status. */
  status: string | null;
}

/** A block/unblock awaiting the structured blocker fields or resolution note. */
export interface BlockPending {
  kind: "block";
  issue: IssueListItem;
  mode: BlockMode;
}

export type PendingAction = ResolvePending | BlockPending;

/** The payload a block/unblock dialog confirms with. */
export type BlockPayload =
  | { kind: "block"; info: BlockInfo }
  | { kind: "unblock"; note: string };

let pending = $state<PendingAction | null>(null);
let busy = $state(false);
let error = $state<string | null>(null);

/** The structured action awaiting confirmation, if any. */
export function getPendingAction(): PendingAction | null {
  return pending;
}

/** Whether a guarded dialog write is in flight. */
export function isActionBusy(): boolean {
  return busy;
}

/** The inline error from the last failed dialog action. */
export function getActionError(): string | null {
  return error;
}

/** Raise the structured close dialog for `issue`. */
export function requestClose(issue: IssueListItem): void {
  pending = { kind: "resolve", issue, mode: "close", status: null };
  error = null;
}

/** Raise the structured reopen dialog for `issue`, optionally into `status`. */
export function requestReopen(
  issue: IssueListItem,
  status: string | null = null,
): void {
  pending = { kind: "resolve", issue, mode: "reopen", status };
  error = null;
}

/** Raise the structured block dialog for `issue`. */
export function requestBlock(issue: IssueListItem): void {
  pending = { kind: "block", issue, mode: "block" };
  error = null;
}

/** Raise the structured unblock dialog for `issue`. */
export function requestUnblock(issue: IssueListItem): void {
  pending = { kind: "block", issue, mode: "unblock" };
  error = null;
}

/** Dismiss the dialog without writing. */
export function cancelAction(): void {
  if (busy) return;
  pending = null;
  error = null;
}

/**
 * Move an issue to a workflow stage. `done` (and any move off a closed issue)
 * routes through the structured dialog instead of a plain label write; every
 * other case applies the optimistic overlay immediately. Returns whether an
 * optimistic write succeeded (dismissed/failed dialog flows return `false`).
 */
export async function moveToStatus(
  issue: IssueListItem,
  status: string | null,
): Promise<boolean> {
  if (status === "done") {
    if (issue.state !== "closed") requestClose(issue);
    return false;
  }
  if (issue.state === "closed") {
    requestReopen(issue, status);
    return false;
  }
  if (issue.status === status) return true;

  const result = await mutate({
    key: overlayKey(issue.repo, issue.number),
    patch: { status },
    failure: "Could not update status",
    commit: () => updateIssue(issue.repo, issue.number, { status }),
  });
  return result.ok;
}

/**
 * Quick priority write used by the board card's metadata tray. Applies the
 * optimistic overlay immediately so the glyph updates before the mirror
 * catches up.
 */
export async function setPriority(
  issue: IssueListItem,
  priority: string | null,
): Promise<boolean> {
  if (issue.priority === priority) return true;
  const result = await mutate({
    key: overlayKey(issue.repo, issue.number),
    patch: { priority },
    failure: "Could not update priority",
    commit: () => updateIssue(issue.repo, issue.number, { priority }),
  });
  return result.ok;
}

/**
 * Quick "assign to me" used by the board card's hover actions. The viewer is
 * resolved from the mirror on the server; the whole assignee list is written
 * because the GitHub endpoint replaces it.
 */
export async function assignToMe(
  issue: IssueListItem,
  viewer: UserRef,
): Promise<boolean> {
  if (issue.assignees.some((person) => person.externalId === viewer.externalId)) {
    return true;
  }
  const assignees = [...issue.assignees, viewer];
  const result = await mutate({
    key: overlayKey(issue.repo, issue.number),
    patch: { assignees },
    failure: "Could not assign issue",
    commit: () =>
      updateIssue(issue.repo, issue.number, {
        assignees: assignees.map((person) => person.login),
      }),
  });
  return result.ok;
}

/**
 * Quick "unassign me" counterpart to {@link assignToMe}, used by the Attention
 * row's hover actions. Writes the whole assignee list because the GitHub
 * endpoint replaces it.
 */
export async function unassignFromMe(
  issue: IssueListItem,
  viewer: UserRef,
): Promise<boolean> {
  if (!issue.assignees.some((person) => person.externalId === viewer.externalId)) {
    return true;
  }
  const assignees = issue.assignees.filter(
    (person) => person.externalId !== viewer.externalId,
  );
  const result = await mutate({
    key: overlayKey(issue.repo, issue.number),
    patch: { assignees },
    failure: "Could not unassign issue",
    commit: () =>
      updateIssue(issue.repo, issue.number, {
        assignees: assignees.map((person) => person.login),
      }),
  });
  return result.ok;
}

/**
 * Move a blocked issue's re-check date without re-recording the block (the
 * Attention view's "snooze"). The date lives in the body's metadata envelope,
 * so the body is fetched and rewritten in place — no comment is posted, keeping
 * a deferral quiet in the issue timeline. Returns whether the write landed.
 */
export async function rescheduleBlock(
  issue: IssueListItem,
  info: Pick<BlockInfo, "blocker" | "needs" | "trying">,
  recheck: string,
): Promise<boolean> {
  const detail = await fetchIssueDetail(issue.repo, issue.number);
  if (!detail.ok) {
    notifyFailure("Could not reschedule re-check", detail.error);
    return false;
  }
  const result = await updateIssue(issue.repo, issue.number, {
    body: writeBlocked(detail.value.body, { ...info, recheck }),
  });
  if (!result.ok) {
    notifyFailure("Could not reschedule re-check", result.error);
    return false;
  }
  return true;
}

/**
 * Apply the close/reopen dialog's structured note, then the state change. The
 * overlay moves the card immediately; on failure it rolls back and the error is
 * shown inline while the dialog stays open.
 */
export async function confirmResolve(payload: {
  reason: CloseReason;
  note: string;
}): Promise<void> {
  const action = pending;
  if (!action || action.kind !== "resolve") return;

  busy = true;
  error = null;
  const reopening = action.mode === "reopen";
  const { issue } = action;

  const outcome = await mutate({
    key: overlayKey(issue.repo, issue.number),
    patch: reopening
      ? {
          state: "open",
          stateReason: null,
          closedAt: null,
          ...(action.status ? { status: action.status } : {}),
        }
      : { state: "closed", stateReason: payload.reason, closedAt: Date.now() },
    failure: reopening ? "Could not reopen issue" : "Could not close issue",
    notify: false,
    commit: () =>
      reopening
        ? reopenIssue(issue.repo, issue.number, payload.note, action.status ?? undefined)
        : closeIssue(issue.repo, issue.number, payload.reason, payload.note),
  });

  busy = false;
  if (outcome.ok) {
    pending = null;
    error = null;
  } else {
    error = outcome.error;
  }
}

/**
 * Apply the block/unblock dialog: fetch the current body so the metadata
 * envelope is merged in place, then post the comment and set the flag. The
 * `blocked` overlay flips immediately and rolls back on failure.
 */
export async function confirmBlock(payload: BlockPayload): Promise<void> {
  const action = pending;
  if (!action || action.kind !== "block") return;

  busy = true;
  error = null;
  const { issue } = action;

  const detail = await fetchIssueDetail(issue.repo, issue.number);
  if (!detail.ok) {
    busy = false;
    error = detail.error;
    return;
  }

  const blocked = payload.kind === "block";
  const body = detail.value.body;
  const outcome = await mutate({
    key: overlayKey(issue.repo, issue.number),
    patch: { blocked },
    failure: blocked ? "Could not block issue" : "Could not unblock issue",
    notify: false,
    commit: () =>
      payload.kind === "block"
        ? blockIssue(issue.repo, issue.number, body, payload.info)
        : unblockIssue(issue.repo, issue.number, body, payload.note),
  });

  busy = false;
  if (outcome.ok) {
    pending = null;
    error = null;
  } else {
    error = outcome.error;
  }
}
