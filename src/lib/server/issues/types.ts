/**
 * Shared DTOs for the local query & mutation service (Milestone 5).
 *
 * The SvelteKit `load` layer (Milestone 6) consumes these directly, so they
 * describe exactly what the cockpit renders: dense stream rows, the Inbox's
 * mixed submission/issue queue, and the six-column status board.
 */
import type { Impact, Urgency } from "#lib/priority";
import type { CommentReactions } from "#lib/reactions";
import type { WaitingReason } from "#lib/waiting";
import type { StagedSubmission } from "#lib/server/intake/staging";
import type { DelayReason } from "#lib/server/actuals/reasons";
import type { DelayItem } from "#lib/server/actuals/store";
import type { IssueTime } from "#lib/server/actuals/time";

/**
 * A mirrored person (author or assignee). Identity is the forge-native
 * `externalId` scoped by `forge`/`instance`; the internal mirror id never
 * leaves the server.
 */
export interface UserRef {
  externalId: string;
  forge: string;
  instance: string;
  login: string;
  avatarUrl: string;
}

/**
 * A milestone attached to an issue, resolved from the repo's mirror. GitHub
 * scopes a milestone to one repository, so the repo slug travels with it.
 */
export interface RepoMilestoneRef {
  repo: string;
  number: number;
  title: string;
  state: string;
  dueOn: number | null;
}

/** One repo-scoped milestone for the Milestones view. */
export interface MilestoneItem {
  repoId: number;
  /** `owner/name`, resolved from `mirror_repo`. */
  repo: string;
  number: number;
  title: string;
  description: string;
  state: string;
  dueOn: number | null;
  openIssues: number;
  closedIssues: number;
  /** `closed / (open + closed)`, `0` when the milestone has no issues. */
  progress: number;
  creator: UserRef | null;
  url: string;
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
}

/** Compact linked-PR state attached to a stream row or board card. */
export interface IssuePullRequestSummary {
  total: number;
  /** Pull requests still open (draft included). */
  open: number;
  merged: number;
  closed: number;
  /** Worst check state across the linked pull requests. */
  checksState: "pending" | "success" | "failure" | "unknown" | null;
  checksFailed: number;
}

/** One linked pull request as the Inspector's Development panel renders it. */
export interface LinkedPullRequest {
  number: number;
  title: string;
  /** `open` | `closed` | `merged` | `unknown`. */
  state: string;
  isDraft: boolean;
  merged: boolean;
  /** `approved` | `changes_requested` | `review_required` | `pending` | null. */
  reviewDecision: string | null;
  approvedCount: number;
  changesRequestedCount: number;
  pendingReviewCount: number;
  checks: {
    state: string;
    total: number | null;
    failed: number | null;
    url: string | null;
  } | null;
  url: string;
  author: UserRef | null;
  source: string;
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
  mergedAt: number | null;
}

/** One row in a dense issue stream (All Issues / My Issues / Inbox issues). */
export interface IssueListItem {
  repoId: number;
  /** `owner/name`, resolved from `mirror_repo`. */
  repo: string;
  number: number;
  title: string;
  state: string;
  stateReason: string | null;
  /** Derived reserved-label caches (SPEC §5.2). */
  status: string | null;
  /** Derived `P1`–`P3`, or `null` when neither axis is assessed. */
  priority: string | null;
  /** Triage axes (`1`–`3`), or `null` when unset. */
  impact: number | null;
  urgency: number | null;
  size: string | null;
  /** Orthogonal `blocked` flag (SPEC §5.1); not a workflow stage. */
  blocked: boolean;
  /** Whether the issue carries the `epic` type label (SPEC §5.1). */
  isEpic?: boolean;
  /** Ambiguous reserved-label timeline flagged for the UI (SPEC §5.2.2). */
  labelConflict: boolean;
  /** When the issue was opened (from GitHub); drives the "opened … ago" label. */
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
  author: UserRef | null;
  assignees: UserRef[];
  /** The issue's milestone, or `null` when unmilestoned. */
  milestone: RepoMilestoneRef | null;
  /** Every label on the issue, reserved and non-reserved. */
  labels: string[];
  /**
   * Monday `YYYY-MM-DD` of the week this issue is committed to, or `null` when
   * it is not planned. Plan state is Funnel-owned and never written to GitHub.
   */
  planWeek?: string | null;
  /**
   * Compact linked-PR indicator for the stream/board. Omitted when the issue
   * has no linked pull requests, so the common payload stays unchanged.
   */
  pullRequest?: IssuePullRequestSummary;
}

/** Planning context the issue page needs to offer a week picker. */
export interface IssuePlanning {
  /**
   * `forge:instance:externalId` keys of the instance's active maintainers.
   * The key, not the login, matches the server's schedule-eligibility check.
   */
  activeMaintainers: string[];
}

/** A parent epic as the Inspector renders it. */
export interface EpicRef {
  /** `owner/name` of the epic's repository. */
  repo: string;
  number: number;
  title: string;
}

/** The Inbox unifies staged intake submissions with untriaged issues. */
export type InboxEntry =
  | { kind: "submission"; submission: StagedSubmission }
  | { kind: "issue"; issue: IssueListItem };

/**
 * A blocked issue surfaced by Attention (SPEC §5.1). Drives the Attention view
 * and its sidebar badge.
 */
export interface AttentionItem {
  issue: IssueListItem;
  /** One-line blocker description from the body metadata. */
  blocker: string;
  /** The concrete step that must happen to unblock it (SPEC §5.1). */
  needs: string;
  /** What is being attempted in the meantime (may be empty). */
  trying: string;
  /** Re-check date `YYYY-MM-DD`, or `""` when missing or malformed. */
  recheck: string;
  /** Why the issue is delayed; older blocks without one read as `other`. */
  reason: DelayReason;
}

/**
 * Funnel-local waiting state for one issue (issue #32). Keyed by the durable
 * `owner/name` plus number and never written to the GitHub body.
 */
export interface IssueWaiting {
  repo: string;
  number: number;
  reason: WaitingReason;
  note: string | null;
  /** Unix ms when the wait began. */
  waitingSince: number;
  /** `YYYY-MM-DD`, or `null` for no re-check date. */
  recheckOn: string | null;
  actorUserId: string | null;
}

/**
 * A waiting issue surfaced by Attention in its own section, separate from
 * blocked issues. `stale` and `days` are derived from `waitingSince`.
 */
export interface WaitingAttentionItem extends IssueWaiting {
  issue: IssueListItem;
  stale: boolean;
  /** Whole calendar days waited. */
  days: number;
}

/** Canonical board column keys; `done` is the closed-completed window. */
export type StatusKey =
  | "backlog"
  | "todo"
  | "in-progress"
  | "in-review"
  | "done";

export interface BoardColumn {
  key: StatusKey;
  /** Human label for the column header. */
  label: string;
  issues: IssueListItem[];
}

export interface StatusBoard {
  columns: BoardColumn[];
}

/** One classified cell in the impact × urgency matrix. */
export interface MatrixCell {
  impact: Impact;
  urgency: Urgency;
  /** Exact SQL count for the assessed pair. */
  total: number;
}

/**
 * The 3×3 priority matrix over the filtered mirror stream. Issues missing an
 * impact and/or urgency stay out of the cells and surface in the assessment
 * counts instead.
 */
export interface MatrixBoard {
  /** The nine classified combinations, in impact-major order. */
  cells: MatrixCell[];
  /** Every issue in the scoped dataset, assessed or not. */
  total: number;
  /** Issues with both axes assigned. */
  rated: number;
  /** Issues missing an impact and/or urgency classification. */
  needsAssessment: number;
}

/**
 * One comment in the Inspector Pane thread. `body` is the raw Markdown kept in
 * the mirror (used for editing); the rendered, sanitized HTML is attached as
 * `bodyHtml` at the delivery boundary — see {@link RenderedComment}.
 */
export interface CommentItem {
  externalId: string;
  author: UserRef | null;
  body: string;
  createdAt: number;
  /** When GitHub last edited the comment; equal to `createdAt` when unedited. */
  updatedAt?: number;
  /**
   * Aggregate reactions plus the signed-in viewer's own choices. Optional so
   * older payload consumers (and tests) keep compiling; the detail query always
   * attaches it.
   */
  reactions?: CommentReactions;
}

/** One comment with server-rendered, sanitized HTML for display. */
export interface RenderedComment extends CommentItem {
  bodyHtml: string;
}

/**
 * One internal work note (ITSM-style journal). Funnel-owned and never posted to
 * GitHub unless explicitly published — publishing deletes the note and turns it
 * into a comment. `body` is raw Markdown; the rendered HTML is attached at the
 * delivery boundary — see {@link RenderedWorkNote}.
 */
export interface WorkNoteItem {
  id: string;
  author: UserRef | null;
  body: string;
  createdAt: number;
  updatedAt: number;
}

/** One work note with server-rendered, sanitized HTML for display. */
export interface RenderedWorkNote extends WorkNoteItem {
  bodyHtml: string;
}

/** One uploaded file in the Inspector dropbox. Bytes are served separately. */
export interface AttachmentItem {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: UserRef | null;
  createdAt: number;
}

/** A repo label option for the Inspector's label picker. */
export interface RepoLabelOption {
  name: string;
  color: string;
}

/**
 * Everything the Inspector Pane reads for one issue, straight from the mirror.
 * `body` and each comment's `body` are raw Markdown; the rendered, sanitized
 * HTML is added by the API route — see {@link RenderedIssueDetail}.
 */
export interface IssueDetail {
  issue: IssueListItem;
  body: string;
  /** Observed and estimated time for the issue (SPEC §1). */
  time: IssueTime;
  /** Delay intervals, oldest first (SPEC §2). */
  delays: DelayItem[];
  /** Funnel-local waiting state, or `null` when the issue is not waiting. */
  waiting: IssueWaiting | null;
  /** The epic that lists this issue as a child, or `null` when none does. */
  epic: EpicRef | null;
  comments: CommentItem[];
  /** Total comments on the issue, including any older than the returned page. */
  commentTotal: number;
  /** Whether older comments exist beyond the returned (newest) page. */
  hasMoreComments: boolean;
  /** Internal work notes for the issue, oldest first. */
  workNotes: WorkNoteItem[];
  /** Files uploaded to the issue's dropbox, oldest first. */
  attachments: AttachmentItem[];
  /** Linked pull requests with state, review decision and check rollup. */
  pullRequests: LinkedPullRequest[];
  /** Every label defined on the issue's repo (reserved and non-reserved). */
  repoLabels: RepoLabelOption[];
  /** Users assignable on the issue's repo, plus current assignees (SPEC §9.2). */
  assigneeOptions: UserRef[];
  /** The issue's repo's milestones, for the Inspector milestone picker. */
  milestoneOptions: RepoMilestoneRef[];
  /** Active maintainer roster, so the issue page can explain plan eligibility. */
  planning: IssuePlanning;
}

/**
 * The Inspector payload as delivered to the client: raw Markdown is retained
 * for the inline editors and each prose field also carries sanitized HTML for
 * `{@html}` (SPEC §2.2).
 */
export interface RenderedIssueDetail
  extends Omit<IssueDetail, "comments" | "workNotes"> {
  bodyHtml: string;
  comments: RenderedComment[];
  workNotes: RenderedWorkNote[];
  /** Whether the signed-in viewer watches this issue. */
  watching: boolean;
}

/** A staged intake submission with its sanitized HTML body for display. */
export interface RenderedSubmission extends StagedSubmission {
  bodyHtml: string;
}

/** An Inbox entry whose submissions carry rendered HTML. */
export type RenderedInboxEntry =
  | { kind: "submission"; submission: RenderedSubmission }
  | { kind: "issue"; issue: IssueListItem };

/** Option lists for the filter bar (Repo, Assignee, Labels dimensions). */
export interface FilterOptions {
  repos: Array<{ id: number; slug: string }>;
  assignees: UserRef[];
  labels: string[];
  /** Repo-scoped milestones, for the milestone filter dimension. */
  milestones: Array<{ repo: string; number: number; title: string }>;
}

/**
 * A selectable mirrored issue for the intake "duplicate" picker (SPEC §6.2):
 * just enough identity to choose a target, since the picker needs no labels
 * or assignees.
 */
export interface IssueOption {
  number: number;
  title: string;
  state: string;
}
