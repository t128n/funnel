/**
 * Centralized optimistic overlay store (SPEC §9.2).
 *
 * Every issue write applies its change here *synchronously* — before the
 * network request starts — and the cockpit renders `load()` data through the
 * `project*` helpers, which lay pending deltas on top. Because the authoritative
 * server payload is never mutated, rollback is exact: a failed write simply
 * removes its overlay.
 *
 * A write publishes two SSE events (one immediately, one after the background
 * mirror refresh), so a refresh can arrive carrying data that does not yet
 * reflect the change. Overlays are therefore dropped by *value*, not by refresh
 * count: {@link reconcileIssues} removes one only once the authoritative data
 * actually satisfies it. That keeps a stale refresh from bouncing the UI back.
 */
import { untrack } from "svelte";
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import { notifyFailure } from "#lib/client/status.svelte";
import type { MutationResult } from "#lib/client/mutations";
import { STATUS_OPTIONS, isUntriaged } from "#lib/labels";
import type {
  IssueListItem,
  RenderedInboxEntry,
  RenderedIssueDetail,
  StatusBoard,
  StatusKey,
} from "#lib/server/issues/types";

/** `owner/name#number`, the identity shared by list rows, cards, and detail. */
export type OverlayKey = `${string}#${number}`;

/** Build the overlay key for an issue. */
export function overlayKey(repo: string, number: number): OverlayKey {
  return `${repo}#${number}`;
}

/** The subset of an issue a mutation may optimistically change. */
export interface IssuePatch {
  title?: string;
  state?: string;
  stateReason?: string | null;
  status?: string | null;
  /** Derived `P1`–`P3`; optimistic writes set it alongside an axis change. */
  priority?: string | null;
  impact?: number | null;
  urgency?: number | null;
  size?: string | null;
  blocked?: boolean;
  assignees?: IssueListItem["assignees"];
  milestone?: IssueListItem["milestone"];
  labels?: string[];
  closedAt?: number | null;
  /** Monday `YYYY-MM-DD` of the committed week, or `null` when unplanned. */
  planWeek?: string | null;
}

const overlays = new SvelteMap<OverlayKey, IssuePatch>();
const removedSubmissions = new SvelteSet<string>();
/**
 * Issues optimistically removed from the Inbox by a snooze. Keyed by
 * `owner/name#number`, the durable snooze identity, so a mirror refresh cannot
 * make the row reappear before the server's own exclusion does.
 */
const snoozedIssues = new SvelteSet<string>();

/** Durable identity for an issue in the snooze overlay. */
function snoozedIssueKey(repo: string, number: number): string {
  return `${repo}#${number}`;
}

/**
 * Bumped on every overlay change. Board projections read this so a re-render
 * that re-buckets the same cards does not look like a content change.
 */
let overlayRevision = 0;

/** Current overlay revision; changes whenever a pending patch is added/removed. */
export function overlayRevisionValue(): number {
  return overlayRevision;
}

const STATUS_KEYS = new Set(STATUS_OPTIONS.map((option) => option.value));

// --- Overlay lifecycle ------------------------------------------------------

function captureOverlay(key: OverlayKey): IssuePatch | null {
  const current = overlays.get(key);
  return current ? { ...current } : null;
}

/** Merge `patch` onto any existing overlay. */
function applyOverlay(key: OverlayKey, patch: IssuePatch): void {
  const current = overlays.get(key);
  overlays.set(key, { ...(current ?? {}), ...patch });
  overlayRevision += 1;
}

/** Restore the exact pre-mutation overlay (or remove it if there was none). */
function restoreOverlay(key: OverlayKey, snapshot: IssuePatch | null): void {
  if (snapshot) overlays.set(key, snapshot);
  else overlays.delete(key);
  overlayRevision += 1;
}

// --- Public mutation entry point -------------------------------------------

/** The result of an optimistic write, carrying the message on failure. */
export type MutateOutcome = { ok: true } | { ok: false; error: string };

export interface MutateOptions<T> {
  key: OverlayKey;
  patch: IssuePatch;
  /** Performs the network write; the overlay is applied before this runs. */
  commit: () => Promise<MutationResult<T>>;
  /** Toast title on failure. */
  failure?: string;
  /** Set `false` when the caller renders the error inline (e.g. a dialog). */
  notify?: boolean;
}

/**
 * Apply `patch` optimistically, run `commit`, and either keep the overlay (for
 * reconciliation once the server catches up) or roll it back and notify. The
 * failure message is always returned so callers can render it inline too.
 */
export async function mutate<T>(
  options: MutateOptions<T>,
): Promise<MutateOutcome> {
  const { key, patch, commit, failure = "Update failed", notify = true } = options;
  const snapshot = captureOverlay(key);
  applyOverlay(key, patch);

  const result = await commit();
  if (!result.ok) {
    restoreOverlay(key, snapshot);
    if (notify) notifyFailure(failure, result.error);
    return { ok: false, error: result.error };
  }

  return { ok: true };
}

export { notifyFailure } from "#lib/client/status.svelte";

// --- Reconciliation ---------------------------------------------------------

/** Compare two string collections as sets (order-insensitive). */
function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const seen = new Set(a);
  for (const value of b) {
    if (!seen.has(value)) return false;
  }
  return true;
}

/**
 * Whether the authoritative issue already reflects `patch`. `closedAt` is
 * excluded (the optimistic `Date.now()` never equals the server timestamp) and
 * assignees are compared by login (optimistic `UserRef`s carry placeholder ids).
 */
function satisfied(issue: IssueListItem, patch: IssuePatch): boolean {
  if (patch.title !== undefined && issue.title !== patch.title) return false;
  if (patch.state !== undefined && issue.state !== patch.state) return false;
  if (patch.stateReason !== undefined && issue.stateReason !== patch.stateReason) {
    return false;
  }
  if (patch.status !== undefined && issue.status !== patch.status) return false;
  if (patch.priority !== undefined && issue.priority !== patch.priority) {
    return false;
  }
  if (patch.impact !== undefined && issue.impact !== patch.impact) return false;
  if (patch.urgency !== undefined && issue.urgency !== patch.urgency) {
    return false;
  }
  if (patch.size !== undefined && issue.size !== patch.size) return false;
  if (patch.blocked !== undefined && issue.blocked !== patch.blocked) return false;
  if (patch.milestone !== undefined) {
    const current = issue.milestone;
    const next = patch.milestone;
    const sameMilestone =
      current === null || next === null
        ? current === next
        : current.repo === next.repo && current.number === next.number;
    if (!sameMilestone) return false;
  }
  if (
    patch.assignees !== undefined &&
    !sameSet(
      issue.assignees.map((person) => person.login),
      patch.assignees.map((person) => person.login),
    )
  ) {
    return false;
  }
  if (patch.labels !== undefined && !sameSet(issue.labels, patch.labels)) {
    return false;
  }
  if (patch.planWeek !== undefined && issue.planWeek !== patch.planWeek) {
    return false;
  }
  return true;
}

/**
 * Drop every overlay the authoritative data already satisfies. Call this with
 * freshly loaded issues; a refresh that still carries the old value leaves the
 * overlay in place, so the optimistic state is not bounced back.
 */
export function reconcileIssues(issues: readonly IssueListItem[]): void {
  untrack(() => {
    for (const issue of issues) {
      const key = overlayKey(issue.repo, issue.number);
      const patch = overlays.get(key);
      if (patch && satisfied(issue, patch)) {
        overlays.delete(key);
        overlayRevision += 1;
      }
    }
  });
}

/**
 * Stop tracking optimistically removed submissions once they are genuinely
 * absent from a fresh load (the triage deleted the row server-side).
 */
export function reconcileSubmissions(presentIds: Iterable<string>): void {
  const present = new Set(presentIds);
  untrack(() => {
    for (const id of removedSubmissions) {
      if (!present.has(id)) removedSubmissions.delete(id);
    }
  });
}

/**
 * Drop optimistic snooze markers once the authoritative Inbox shows the issue
 * again (its snooze became due, or it was resurfaced elsewhere). An absent row
 * is left alone: it may simply be beyond the loaded page, and keeping the
 * marker cannot bring a row back once the server excludes it.
 */
export function reconcileSnoozedIssues(
  issues: readonly IssueListItem[],
): void {
  if (snoozedIssues.size === 0) return;
  const present = new Set(
    issues.map((issue) => snoozedIssueKey(issue.repo, issue.number)),
  );
  untrack(() => {
    for (const key of snoozedIssues) {
      if (present.has(key)) snoozedIssues.delete(key);
    }
  });
}

// --- Projections ------------------------------------------------------------

/** Apply a pending overlay to a single issue. */
export function projectIssue(issue: IssueListItem): IssueListItem {
  const patch = overlays.get(overlayKey(issue.repo, issue.number));
  return patch ? { ...issue, ...patch } : issue;
}

/** Apply pending overlays across a dense issue stream. */
export function projectIssues(issues: IssueListItem[]): IssueListItem[] {
  // No overlays at all: the caller's array is already the projection.
  if (overlays.size === 0) return issues;

  // Copy only once a matching overlay is found, so an unrelated pending write
  // (or a stream with no overlaid rows) does not allocate a full copy.
  let projected: IssueListItem[] | null = null;
  for (let index = 0; index < issues.length; index += 1) {
    const issue = issues[index];
    const patch = overlays.get(overlayKey(issue.repo, issue.number));
    if (!patch) {
      if (projected !== null) projected.push(issue);
      continue;
    }
    if (projected === null) projected = issues.slice(0, index);
    projected.push({ ...issue, ...patch });
  }
  return projected ?? issues;
}

/** Apply a pending overlay to the Inspector payload. */
export function projectDetail(
  detail: RenderedIssueDetail | null,
): RenderedIssueDetail | null {
  if (!detail) return detail;
  const patch = overlays.get(
    overlayKey(detail.issue.repo, detail.issue.number),
  );
  return patch
    ? { ...detail, issue: { ...detail.issue, ...patch } }
    : detail;
}

/** The column an issue belongs to under the board's partitioning. */
function boardColumn(issue: IssueListItem): StatusKey | null {
  if (issue.state === "closed") {
    return issue.stateReason === "completed" ? "done" : null;
  }
  return issue.status && STATUS_KEYS.has(issue.status)
    ? (issue.status as StatusKey)
    : null;
}

/**
 * Re-bucket a board after applying overlays, so an optimistic status or state
 * change moves the card between columns immediately.
 */
export function projectBoard(board: StatusBoard): StatusBoard {
  // No overlays: re-bucketing would reproduce the server's own lanes.
  if (overlays.size === 0) return board;

  const buckets = new Map<StatusKey, IssueListItem[]>();
  for (const column of board.columns) buckets.set(column.key, []);

  for (const column of board.columns) {
    for (const raw of column.issues) {
      const issue = projectIssue(raw);
      const key = boardColumn(issue);
      if (key === null) continue;
      buckets.get(key)?.push(issue);
    }
  }

  return {
    columns: board.columns.map((column) => {
      const issues = buckets.get(column.key) ?? [];
      // Keep the original column (and array) when the overlay did not change
      // this lane, so untouched lanes stay identity-stable for the board.
      if (issues.length === column.issues.length) {
        let unchanged = true;
        for (let index = 0; index < issues.length; index += 1) {
          if (issues[index] !== column.issues[index]) {
            unchanged = false;
            break;
          }
        }
        if (unchanged) return column;
      }
      return { ...column, issues };
    }),
  };
}

/**
 * Project the Inbox queue, dropping submissions optimistically removed and
 * issues an overlay has moved out of the queue (setting a status makes an issue
 * triaged, so it leaves the Inbox the instant the overlay is applied rather
 * than when the mirror next refreshes).
 */
export function projectInboxEntries(
  entries: RenderedInboxEntry[],
): RenderedInboxEntry[] {
  const projected: RenderedInboxEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === "submission") {
      if (removedSubmissions.has(entry.submission.id)) continue;
      projected.push(entry);
    } else {
      const issue = projectIssue(entry.issue);
      if (!isUntriaged(issue)) continue;
      if (snoozedIssues.has(snoozedIssueKey(issue.repo, issue.number))) {
        continue;
      }
      projected.push({ kind: "issue", issue });
    }
  }
  return projected;
}

// --- Optimistic submission removal (inbox triage) ---------------------------

/** Hide a staged submission before the triage action round-trips. */
export function removeSubmission(id: string): void {
  removedSubmissions.add(id);
}

/** Restore a submission whose triage action failed. */
export function restoreSubmission(id: string): void {
  removedSubmissions.delete(id);
}

// --- Optimistic snooze removal (inbox defer) -------------------------------

/** Hide an issue from the Inbox before the snooze request round-trips. */
export function removeSnoozedIssue(repo: string, number: number): void {
  snoozedIssues.add(snoozedIssueKey(repo, number));
}

/** Put an issue back when its snooze request failed. */
export function restoreSnoozedIssue(repo: string, number: number): void {
  snoozedIssues.delete(snoozedIssueKey(repo, number));
}
