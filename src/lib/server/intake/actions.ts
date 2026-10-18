/**
 * Triage decisions for staged intake submissions (SPEC §6.2).
 *
 * These are the pure, transport-agnostic *actions* behind the Inbox buttons.
 * A future SvelteKit server action (Milestone 6, `/inbox` route) resolves the
 * signed-in user and passes a user-token Octokit — SPEC §8: every write
 * executes with the user's token, and GitHub enforces repo permissions
 * natively. Keeping the session/token out of this module makes the decisions
 * directly unit-testable.
 *
 * Each decision is pessimistic (SPEC §1.4): the staging row is hard-deleted
 * only after GitHub confirms the write. On failure the row is retained so the
 * triager can retry.
 */
import type { Octokit } from "octokit";
import { getConfig, isConfiguredRepo } from "#lib/server/config";
import {
  errorMessage,
  errorStatus,
  type Outcome,
} from "#lib/server/http/outcome";
import { createLogger } from "#lib/server/log";
import { getIssue, getRepoByOrgName } from "#lib/server/sync/mirror";
import { publish } from "#lib/server/sync/events";
import {
  deleteSubmission,
  getSubmission,
  type StagedSubmission,
} from "./staging";

// Re-exported so existing importers (and the UI layer) keep a single source.
export type { Outcome } from "#lib/server/http/outcome";

const log = createLogger({ component: "intake" });

/** Default workflow status applied to an accepted issue (SPEC §6.2). */
export const DEFAULT_ACCEPT_STATUS = "backlog";

export interface AcceptResult {
  number: number;
  htmlUrl: string;
}

export interface AcceptInput {
  id: string;
  /** User-token client (SPEC §8). */
  octokit: Octokit;
  /** Target repo; defaults to `intake.default_repo` when omitted. */
  repo?: string;
  /** Extra labels; the default status label is added if absent. */
  labels?: readonly string[];
  assignees?: readonly string[];
}

export interface DuplicateInput {
  id: string;
  octokit: Octokit;
  /** Existing mirrored issue to comment on, in `owner/name` form. */
  repo: string;
  number: number;
}

/** Plain-text provenance footer appended to accepted issues (SPEC §6.2). */
function provenanceFooter(source: string | null): string {
  return source
    ? `_Submitted via Funnel intake (source: ${source})_`
    : `_Submitted via Funnel intake_`;
}

/** Submission body plus the provenance footer, skipping empty segments. */
function composeBody(body: string, source: string | null): string {
  return [body.trim(), provenanceFooter(source)]
    .filter((part) => part.length > 0)
    .join("\n\n");
}

/** Status label first, then any caller labels, de-duplicated. */
function acceptLabels(labels: readonly string[] | undefined): string[] {
  return [...new Set([DEFAULT_ACCEPT_STATUS, ...(labels ?? [])])];
}

/** Comment body for a duplicate decision: the submission text, in full. */
function duplicateComment(submission: StagedSubmission): string {
  return [
    `**${submission.title}**`,
    submission.body.trim(),
    provenanceFooter(submission.source),
  ]
    .filter((part) => part.length > 0)
    .join("\n\n");
}

/**
 * Accept a submission: create the GitHub issue and clear the queue.
 *
 * Repo resolution: the explicit selector wins; otherwise `intake.default_repo`.
 * A repo that is not in instance settings is rejected so triage can never
 * target an unmapped repository.
 */
export async function acceptSubmission(
  input: AcceptInput,
): Promise<Outcome<AcceptResult>> {
  const submission = getSubmission(input.id);
  if (!submission) {
    return { ok: false, status: 404, message: "Submission not found" };
  }

  const config = await getConfig();
  const target = input.repo ?? config.intake.default_repo;
  if (!target) {
    return { ok: false, status: 400, message: "No target repository selected" };
  }
  if (!isConfiguredRepo(config, target)) {
    return {
      ok: false,
      status: 400,
      message: `Repository ${target} is not configured`,
    };
  }

  const slash = target.indexOf("/");
  const owner = target.slice(0, slash);
  const repo = target.slice(slash + 1);
  const labels = acceptLabels(input.labels);

  const params: {
    owner: string;
    repo: string;
    title: string;
    body: string;
    labels: string[];
    assignees?: string[];
  } = {
    owner,
    repo,
    title: submission.title,
    body: composeBody(submission.body, submission.source),
    labels,
  };
  if (input.assignees && input.assignees.length > 0) {
    params.assignees = [...input.assignees];
  }

  let data: { number?: number; html_url?: string };
  try {
    const res = await input.octokit.request(
      "POST /repos/{owner}/{repo}/issues",
      params,
    );
    data = res.data as typeof data;
  } catch (error) {
    log.warn(
      { id: input.id, repo: target, err: errorMessage(error) },
      "accept failed",
    );
    return { ok: false, status: errorStatus(error), message: errorMessage(error) };
  }

  // GitHub is the source of truth: only a confirmed create clears the queue
  // (SPEC §6.2). A crash between success and this delete can leave the row
  // staged; retrying would double-create, which the pessimistic model accepts.
  deleteSubmission(input.id);
  publish({
    type: "intake",
    action: "accepted",
    id: input.id,
    repo: target,
    number: data.number ?? null,
  });
  return {
    ok: true,
    value: { number: data.number ?? 0, htmlUrl: data.html_url ?? "" },
  };
}

/** Dismiss a submission: hard-delete, no GitHub mutation (SPEC §6.2). */
export function dismissSubmission(input: { id: string }): Outcome<{ id: string }> {
  if (!deleteSubmission(input.id)) {
    return { ok: false, status: 404, message: "Submission not found" };
  }
  publish({ type: "intake", action: "dismissed", id: input.id });
  return { ok: true, value: { id: input.id } };
}

/**
 * Duplicate a submission onto an existing mirrored issue (SPEC §6.2): post the
 * submission text as a comment, then clear the queue. The target must be
 * present in the disposable mirror — the picker only ever offers mirrored
 * issues.
 */
export async function duplicateSubmission(
  input: DuplicateInput,
): Promise<Outcome<AcceptResult>> {
  const submission = getSubmission(input.id);
  if (!submission) {
    return { ok: false, status: 404, message: "Submission not found" };
  }

  const slash = input.repo.indexOf("/");
  const org = input.repo.slice(0, slash);
  const name = input.repo.slice(slash + 1);

  const mirroredRepo = getRepoByOrgName(org, name);
  if (!mirroredRepo) {
    return {
      ok: false,
      status: 404,
      message: `Repository ${input.repo} is not mirrored`,
    };
  }
  if (!getIssue(mirroredRepo.githubId, input.number)) {
    return {
      ok: false,
      status: 404,
      message: `Issue ${input.repo}#${input.number} is not mirrored`,
    };
  }

  let data: { html_url?: string };
  try {
    const res = await input.octokit.request(
      "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
      {
        owner: org,
        repo: name,
        issue_number: input.number,
        body: duplicateComment(submission),
      },
    );
    data = res.data as typeof data;
  } catch (error) {
    log.warn(
      { id: input.id, repo: input.repo, number: input.number, err: errorMessage(error) },
      "duplicate failed",
    );
    return { ok: false, status: errorStatus(error), message: errorMessage(error) };
  }

  deleteSubmission(input.id);
  publish({
    type: "intake",
    action: "duplicated",
    id: input.id,
    repo: input.repo,
    number: input.number,
  });
  return {
    ok: true,
    value: { number: input.number, htmlUrl: data.html_url ?? "" },
  };
}
