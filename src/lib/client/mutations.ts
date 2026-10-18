/**
 * Client-side wrappers over Funnel's write endpoints (SPEC §9.2).
 *
 * Every mutation is pessimistic: the caller awaits the response and only then
 * updates local state. The routes execute with the signed-in user's GitHub
 * token and schedule a background refresh of the touched issue, so the SSE
 * stream catches the cockpit up shortly after the response resolves.
 */
import type { RenderedIssueDetail } from "#lib/server/issues/types";

export type MutationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

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
    if (!response.ok) return { ok: false, error: await toError(response) };
    if (response.status === 204) return { ok: true, value: undefined as T };
    return { ok: true, value: (await response.json()) as T };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

/** Read one issue's full Inspector payload from the local mirror. */
export function fetchIssueDetail(
  repo: string,
  number: number,
): Promise<MutationResult<RenderedIssueDetail>> {
  return request<RenderedIssueDetail>(
    `/api/mirror/issues/${repoPath(repo)}/${number}`,
  );
}

export interface UpdateIssuePatch {
  title?: string;
  body?: string;
  assignees?: string[];
  state?: "open" | "closed";
  state_reason?: "completed" | "not_planned" | null;
  status?: string | null;
  priority?: string | null;
  size?: string | null;
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
 * (SPEC §5.2.3).
 */
export function reopenIssue(
  repo: string,
  number: number,
  note: string,
): Promise<MutationResult<{ number: number; htmlUrl: string }>> {
  return commentThenUpdate(repo, number, note, { state: "open" });
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
  priority?: string;
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
