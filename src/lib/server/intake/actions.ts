/**
 * Triage decisions for staged intake submissions (SPEC §6.2).
 *
 * These are the pure, transport-agnostic *actions* behind the Inbox buttons.
 * A future SvelteKit server action (Milestone 6, `/inbox` route) resolves the
 * signed-in user and passes a user-token provider — SPEC §8: every write
 * executes with the user's token, and GitHub enforces repo permissions
 * natively. Keeping the session/token out of this module makes the decisions
 * directly unit-testable.
 *
 * Each decision is pessimistic (SPEC §1.4): the staging row is hard-deleted
 * only after GitHub confirms the write. On failure the row is retained so the
 * triager can retry.
 */
import { getConfig, isConfiguredRepo } from "#lib/server/config";
import type { GitHubProvider } from "#lib/server/forge/providers.server";
import type { Outcome } from "#lib/server/http/outcome";
import {
  addIssueComment,
  createIssue,
} from "#lib/server/issues/mutations";
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
  /** User-token provider (SPEC §8). */
  provider: GitHubProvider;
  /** Target repo; defaults to `intake.default_repo` when omitted. */
  repo?: string;
  /** Extra labels; the default status label is added if absent. */
  labels?: readonly string[];
  assignees?: readonly string[];
}

export interface DuplicateInput {
  id: string;
  provider: GitHubProvider;
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

  const labels = acceptLabels(input.labels);

  const created = await createIssue({
    provider: input.provider,
    repo: target,
    title: submission.title,
    body: composeBody(submission.body, submission.source),
    labels,
    assignees: input.assignees,
  });
  if (!created.ok) {
    log.warn(
      { id: input.id, repo: target, err: created.message },
      "accept failed",
    );
    return created;
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
    number: created.value.number,
  });
  return {
    ok: true,
    value: { number: created.value.number, htmlUrl: created.value.htmlUrl },
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

  const commented = await addIssueComment({
    provider: input.provider,
    repo: input.repo,
    number: input.number,
    body: duplicateComment(submission),
  });
  if (!commented.ok) {
    log.warn(
      {
        id: input.id,
        repo: input.repo,
        number: input.number,
        err: commented.message,
      },
      "duplicate failed",
    );
    return commented;
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
    value: { number: input.number, htmlUrl: commented.value.htmlUrl },
  };
}
