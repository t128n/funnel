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
  /** Ambiguous reserved-label timeline flagged for the UI (SPEC §5.2.2). */
  labelConflict: boolean;
  updatedAt: number;
  closedAt: number | null;
  author: UserRef | null;
  assignees: UserRef[];
  /** Every label on the issue, reserved and non-reserved. */
  labels: string[];
}

/** The Inbox unifies staged intake submissions with untriaged issues. */
export type InboxEntry =
  | { kind: "submission"; submission: StagedSubmission }
  | { kind: "issue"; issue: IssueListItem };

/** Canonical board column keys; `done` is the closed-completed window. */
export type StatusKey =
  | "backlog"
  | "todo"
  | "in-progress"
  | "in-review"
  | "blocked"
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

/** One comment in the Inspector Pane thread (plain text; no Markdown). */
export interface CommentItem {
  githubId: number;
  author: UserRef | null;
  body: string;
  createdAt: number;
}

/** A repo label option for the Inspector's label picker. */
export interface RepoLabelOption {
  name: string;
  color: string;
}

/** Everything the Inspector Pane renders for one issue. */
export interface IssueDetail {
  issue: IssueListItem;
  body: string;
  comments: CommentItem[];
  /** Every label defined on the issue's repo (reserved and non-reserved). */
  repoLabels: RepoLabelOption[];
  /** Users assignable on the issue's repo, plus current assignees (SPEC §9.2). */
  assigneeOptions: UserRef[];
}

/** Option lists for the filter bar (Repo, Assignee, Labels dimensions). */
export interface FilterOptions {
  repos: Array<{ id: number; slug: string }>;
  assignees: UserRef[];
  labels: string[];
}
