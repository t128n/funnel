/**
 * Shared DTOs for the local query & mutation service (Milestone 5).
 *
 * The SvelteKit `load` layer (Milestone 6) consumes these directly, so they
 * describe exactly what the cockpit renders: dense stream rows, the Inbox's
 * mixed submission/issue queue, and the six-column status board.
 */
import type { StagedSubmission } from "#lib/server/intake/staging";

/** A mirrored person (author or assignee). */
export interface UserRef {
  githubId: number;
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
  /** `owner/name`, resolved from `mirror_github_repo`. */
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
  htmlUrl: string;
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
}

/** One row in a dense issue stream (All Issues / My Issues / Inbox issues). */
export interface IssueListItem {
  repoId: number;
  /** `owner/name`, resolved from `mirror_github_repo`. */
  repo: string;
  number: number;
  title: string;
  state: string;
  stateReason: string | null;
  /** Derived reserved-label caches (SPEC §5.2). */
  status: string | null;
  priority: string | null;
  size: string | null;
  /** Orthogonal `blocked` flag (SPEC §5.1); not a workflow stage. */
  blocked: boolean;
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
}

/** The Inbox unifies staged intake submissions with untriaged issues. */
export type InboxEntry =
  | { kind: "submission"; submission: StagedSubmission }
  | { kind: "issue"; issue: IssueListItem };

/**
 * A blocked issue whose body metadata carries a re-check date (SPEC §5.1).
 * Drives the Attention view and its sidebar badge.
 */
export interface AttentionItem {
  issue: IssueListItem;
  /** One-line blocker description from the body metadata. */
  blocker: string;
  /** The concrete step that must happen to unblock it (SPEC §5.1). */
  needs: string;
  /** What is being attempted in the meantime (may be empty). */
  trying: string;
  /** Re-check date, `YYYY-MM-DD`. */
  recheck: string;
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

/**
 * One comment in the Inspector Pane thread. `body` is the raw Markdown kept in
 * the mirror (used for editing); the rendered, sanitized HTML is attached as
 * `bodyHtml` at the delivery boundary — see {@link RenderedComment}.
 */
export interface CommentItem {
  githubId: number;
  author: UserRef | null;
  body: string;
  createdAt: number;
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
  comments: CommentItem[];
  /** Internal work notes for the issue, oldest first. */
  workNotes: WorkNoteItem[];
  /** Files uploaded to the issue's dropbox, oldest first. */
  attachments: AttachmentItem[];
  /** Every label defined on the issue's repo (reserved and non-reserved). */
  repoLabels: RepoLabelOption[];
  /** Users assignable on the issue's repo, plus current assignees (SPEC §9.2). */
  assigneeOptions: UserRef[];
  /** The issue's repo's milestones, for the Inspector milestone picker. */
  milestoneOptions: RepoMilestoneRef[];
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
