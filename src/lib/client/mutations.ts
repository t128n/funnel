/**
 * Client-side wrappers over Funnel's write endpoints (SPEC §9.2).
 *
 * Every mutation is pessimistic: the caller awaits the response and only then
 * updates local state. The routes execute with the signed-in user's GitHub
 * token and schedule a background refresh of the touched issue, so the SSE
 * stream catches the cockpit up shortly after the response resolves.
 */
import type {
  AttachmentItem,
  IssueOption,
  RenderedIssueDetail,
  WorkNoteItem,
} from "#lib/server/issues/types";
import {
  formatBlockComment,
  formatUnblockComment,
  writeBlocked,
  type BlockInfo,
} from "#lib/funnel-metadata";

export type MutationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; status?: number };

/** Split an `owner/name` slug into encoded path segments. */
function repoPath(repo: string): string {
  const slash = repo.indexOf("/");
  const owner = slash > 0 ? repo.slice(0, slash) : repo;
  const name = slash > 0 ? repo.slice(slash + 1) : "";
  return `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

async function toError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    if (body?.message) return body.message;
  } catch {
    // Fall through to the status text.
  }
  return `${response.status} ${response.statusText}`.trim();
}

async function request<T>(
  url: string,
  init?: RequestInit,
): Promise<MutationResult<T>> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) {
      return {
        ok: false,
        error: await toError(response),
        status: response.status,
      };
    }
    if (response.status === 204) return { ok: true, value: undefined as T };
    return { ok: true, value: (await response.json()) as T };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

/**
 * Read one issue's full Inspector payload from the local mirror. `commentLimit`
 * pages the thread from the newest end (the server bounds it).
 */
export function fetchIssueDetail(
  repo: string,
  number: number,
  commentLimit?: number,
): Promise<MutationResult<RenderedIssueDetail>> {
  const query =
    commentLimit === undefined ? "" : `?comments=${encodeURIComponent(commentLimit)}`;
  return request<RenderedIssueDetail>(
    `/api/mirror/issues/${repoPath(repo)}/${number}${query}`,
  );
}

/** List mirrored issues in a repo (the intake duplicate picker's options). */
export function fetchRepoIssues(
  repo: string,
): Promise<MutationResult<IssueOption[]>> {
  return request<IssueOption[]>(`/api/mirror/issues/${repoPath(repo)}`);
}

/**
 * Turn watching on or off for one issue. Watching is a personal preference, so
 * it only needs the `read` role; the server scopes the row to the session user.
 */
export function setIssueWatching(
  repo: string,
  number: number,
  watching: boolean,
): Promise<MutationResult<{ watching: boolean }>> {
  return request(`/api/mirror/issues/${repoPath(repo)}/${number}/watch`, {
    method: watching ? "PUT" : "DELETE",
  });
}

export interface UpdateIssuePatch {
  title?: string;
  body?: string;
  assignees?: string[];
  state?: "open" | "closed";
  state_reason?: "completed" | "not_planned" | null;
  status?: string | null;
  /** Canonical `sev`/`mod`/`min` label; `null` clears the group. */
  impact?: string | null;
  /** Canonical `high`/`mid`/`low` label; `null` clears the group. */
  urgency?: string | null;
  size?: string | null;
  /** Toggles the orthogonal `blocked` flag (SPEC §5.1). */
  blocked?: boolean;
  /** `null` clears the milestone; omitted leaves it untouched. */
  milestone?: number | null;
}

export function updateIssue(
  repo: string,
  number: number,
  patch: UpdateIssuePatch,
): Promise<MutationResult<{ number: number; htmlUrl: string }>> {
  return request(`/api/repos/${repoPath(repo)}/issues/${number}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/** Structured resolution for closing an issue (SPEC §5.2.3). */
export type CloseReason = "completed" | "not_planned";

/**
 * Close an issue with a required resolution (SPEC §5.2.3). The resolution note
 * is posted as a comment *before* the state change, so an issue is never closed
 * without its resolution recorded. Labels are left untouched; a later reopen
 * therefore restores the prior status as-is.
 */
export function closeIssue(
  repo: string,
  number: number,
  reason: CloseReason,
  note: string,
): Promise<MutationResult<{ number: number; htmlUrl: string }>> {
  return commentThenUpdate(repo, number, note, {
    state: "closed",
    state_reason: reason,
  });
}

/**
 * Reopen a closed issue, recording a required reopen note as a comment first
 * (SPEC §5.2.3). When `status` is provided it replaces the preserved status
 * label in the same write, so reopening straight into a new workflow state is a
 * single round trip after the note.
 */
export function reopenIssue(
  repo: string,
  number: number,
  note: string,
  status?: string,
): Promise<MutationResult<{ number: number; htmlUrl: string }>> {
  return commentThenUpdate(
    repo,
    number,
    note,
    status ? { state: "open", status } : { state: "open" },
  );
}

/**
 * Block an issue with structured metadata (SPEC §5.1). The blocker summary is
 * posted as a comment, the body's `funnel_metadata` envelope records the
 * structured fields, and the `blocked` flag is applied — the comment goes first
 * so a blocker is never recorded without its explanation.
 */
export function blockIssue(
  repo: string,
  number: number,
  body: string,
  info: BlockInfo,
): Promise<MutationResult<{ number: number; htmlUrl: string }>> {
  return commentThenUpdate(repo, number, formatBlockComment(info), {
    body: writeBlocked(body, info),
    blocked: true,
  });
}

/**
 * Unblock an issue, recording the resolution as a comment first and clearing the
 * structured blocker fields from the body metadata.
 */
export function unblockIssue(
  repo: string,
  number: number,
  body: string,
  note: string,
): Promise<MutationResult<{ number: number; htmlUrl: string }>> {
  return commentThenUpdate(repo, number, formatUnblockComment(note), {
    body: writeBlocked(body, null),
    blocked: false,
  });
}

/**
 * Post `note` as a comment, then apply `patch`. The comment must succeed first:
 * a failed state change leaves the note on the issue (recoverable) rather than
 * closing/reopening without it.
 */
async function commentThenUpdate(
  repo: string,
  number: number,
  note: string,
  patch: UpdateIssuePatch,
): Promise<MutationResult<{ number: number; htmlUrl: string }>> {
  const body = note.trim();
  if (body.length === 0) {
    return { ok: false, error: "A note is required." };
  }
  const comment = await addIssueComment(repo, number, body);
  if (!comment.ok) return comment;
  return updateIssue(repo, number, patch);
}

export function addIssueComment(
  repo: string,
  number: number,
  body: string,
): Promise<MutationResult<{ id: number; htmlUrl: string }>> {
  return request(`/api/repos/${repoPath(repo)}/issues/${number}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function addIssueLabels(
  repo: string,
  number: number,
  labels: string[],
): Promise<MutationResult<{ labels: string[] }>> {
  return request(`/api/repos/${repoPath(repo)}/issues/${number}/labels`, {
    method: "POST",
    body: JSON.stringify({ labels }),
  });
}

export function removeIssueLabel(
  repo: string,
  number: number,
  name: string,
): Promise<MutationResult<{ name: string }>> {
  return request(
    `/api/repos/${repoPath(repo)}/issues/${number}/labels/${encodeURIComponent(name)}`,
    { method: "DELETE" },
  );
}

export interface CreateIssueInput {
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
  status?: string;
  impact?: string;
  urgency?: string;
  size?: string;
}

export function createIssue(
  repo: string,
  input: CreateIssueInput,
): Promise<MutationResult<{ number: number; htmlUrl: string }>> {
  return request(`/api/repos/${repoPath(repo)}/issues`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface CreateMilestoneInput {
  title: string;
  description?: string;
  /** ISO date (`YYYY-MM-DD`). */
  dueOn?: string | null;
}

/**
 * Create a milestone in one repository (the Inspector's "New milestone…" path).
 * GitHub scopes milestones per repo, so a milestone that spans repositories is
 * created once in each.
 */
export function createRepoMilestone(
  repo: string,
  input: CreateMilestoneInput,
): Promise<MutationResult<{ number: number; htmlUrl: string }>> {
  return request(`/api/repos/${repoPath(repo)}/milestones`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ---------------------------------------------------------------------------
// Work notes (Funnel-local, internal)
// ---------------------------------------------------------------------------

function workNotePath(repo: string, number: number, id?: string): string {
  const base = `/api/repos/${repoPath(repo)}/issues/${number}/work-notes`;
  return id === undefined ? base : `${base}/${encodeURIComponent(id)}`;
}

export function addWorkNote(
  repo: string,
  number: number,
  body: string,
): Promise<MutationResult<WorkNoteItem>> {
  return request(workNotePath(repo, number), {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function updateWorkNote(
  repo: string,
  number: number,
  id: string,
  body: string,
): Promise<MutationResult<WorkNoteItem>> {
  return request(workNotePath(repo, number, id), {
    method: "PATCH",
    body: JSON.stringify({ body }),
  });
}

export function deleteWorkNote(
  repo: string,
  number: number,
  id: string,
): Promise<MutationResult<void>> {
  return request(workNotePath(repo, number, id), { method: "DELETE" });
}

/**
 * Post an internal note to GitHub as a comment (one-way, explicit). Succeeds by
 * deleting the note server-side, so it leaves the work-notes list.
 */
export function publishWorkNote(
  repo: string,
  number: number,
  id: string,
): Promise<MutationResult<{ id: string }>> {
  return request(`${workNotePath(repo, number, id)}/publish`, {
    method: "POST",
  });
}

// ---------------------------------------------------------------------------
// Attachments (the Inspector dropbox)
// ---------------------------------------------------------------------------

function attachmentPath(repo: string, number: number): string {
  return `/api/repos/${repoPath(repo)}/issues/${number}/attachments`;
}

/** Upload one file; `request()` is JSON-only, so multipart is sent directly. */
export async function uploadAttachment(
  repo: string,
  number: number,
  file: File,
): Promise<MutationResult<AttachmentItem>> {
  const form = new FormData();
  form.append("file", file);
  try {
    const response = await fetch(attachmentPath(repo, number), {
      method: "POST",
      body: form,
    });
    if (!response.ok) {
      return {
        ok: false,
        error: await toError(response),
        status: response.status,
      };
    }
    return { ok: true, value: (await response.json()) as AttachmentItem };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export function deleteAttachment(
  id: string,
): Promise<MutationResult<void>> {
  return request(`/api/attachments/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/** Direct download URL for an attachment (session cookie is sent by the browser). */
export function attachmentUrl(id: string): string {
  return `/api/attachments/${encodeURIComponent(id)}`;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * Mark one notification read (`{ id }`) or every unread notification read
 * (`{ all: true }`). The response carries the viewer's fresh unread count so the
 * caller can update the badge without a second round trip.
 */
export function markNotificationsRead(
  input: { id: string } | { all: true },
): Promise<MutationResult<{ unreadCount: number }>> {
  return request("/api/notifications", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
