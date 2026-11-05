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
 * Each decision is pessimistic (SPEC §1.4): the staging row is archived only
 * after GitHub confirms the write. On failure the row is retained so the
 * triager can retry. Every successful decision appends a `state_triage_event`
 * row; the event log is the durable history, while the archived submission is
 * only the queue's local view.
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
import { vocabularyFor } from "#lib/server/label-vocabulary";
import { isRetiredPriorityLabel } from "#lib/priority";
import { publish } from "#lib/server/sync/events";
import {
  getTriageEvent,
  latestTriageEvent,
  recordTriageEvent,
} from "./events";
import {
  archiveSubmission,
  getSubmission,
  restoreSubmission,
  type StagedSubmission,
} from "./staging";

// Re-exported so existing importers (and the UI layer) keep a single source.
export type { Outcome } from "#lib/server/http/outcome";

const log = createLogger({ component: "intake" });

/** Default workflow status applied to an accepted issue (SPEC §6.2). */
export const DEFAULT_ACCEPT_STATUS = "backlog";

/** Dismiss reasons are required free text, trimmed to this many characters. */
export const MAX_DISMISS_REASON = 500;

export interface AcceptResult {
  number: number;
  htmlUrl: string;
}

export interface AcceptInput {
  id: string;
  /** `auth_user.id` of the triager who made the decision. */
  actorUserId: string;
  /** User-token provider (SPEC §8). */
  provider: GitHubProvider;
  /** Target repo; defaults to `intake.default_repo` when omitted. */
  repo?: string;
  /** Workflow status (logical key); defaults to {@link DEFAULT_ACCEPT_STATUS}. */
  status?: string;
  /** Extra labels; the status label is added first. */
  labels?: readonly string[];
  assignees?: readonly string[];
}

export interface DuplicateInput {
  id: string;
  actorUserId: string;
  provider: GitHubProvider;
  /** Existing mirrored issue to comment on, in `owner/name` form. */
  repo: string;
  number: number;
}

export interface DismissInput {
  id: string;
  actorUserId: string;
  /** Required free-text reason; trimmed and capped at {@link MAX_DISMISS_REASON}. */
  reason: string;
}

export interface DismissResult {
  id: string;
  /** The appended `dismissed` event, used by the inline Undo affordance. */
  eventId: string;
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

/**
 * Status label first, then any caller labels, de-duplicated. Retired priority
 * labels are dropped so intake can never recreate the old projection.
 */
function acceptLabels(
  status: string,
  labels: readonly string[] | undefined,
): string[] {
  return [
    ...new Set(
      [status, ...(labels ?? [])].filter(
        (label) => !isRetiredPriorityLabel(label),
      ),
    ),
  ];
}

/**
 * Resolve an accept status to its actual (possibly prefixed) GitHub label name.
 * An unknown status is rejected rather than silently written as a plain label.
 */
function resolveAcceptStatus(
  status: string | undefined,
  vocabulary: ReturnType<typeof vocabularyFor>,
): string | null {
  const key = (status ?? DEFAULT_ACCEPT_STATUS).trim().toLowerCase();
  if (key.length === 0) return null;
  const entry = vocabulary.byBase.get(key) ?? vocabulary.byName.get(key);
  return entry?.group === "status" ? entry.name : null;
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
  if (!submission || submission.archivedAt !== null) {
    return { ok: false, status: 404, message: "Submission not found" };
  }

  const config = await getConfig();
  const status = resolveAcceptStatus(
    input.status,
    vocabularyFor(config.labels.prefix),
  );
  if (status === null) {
    return {
      ok: false,
      status: 400,
      message: `Invalid status value: ${input.status ?? ""}`,
    };
  }
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

  const labels = acceptLabels(status, input.labels);

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
      { id: input.id, repo: target, status: created.status, err: created.message },
      "accept failed",
    );
    return created;
  }

  // GitHub is the source of truth: only a confirmed create archives the row
  // (SPEC §6.2). A crash between success and this archive can leave the row
  // staged; retrying would double-create, which the pessimistic model accepts.
  archiveSubmission(input.id);
  recordTriageEvent({
    submissionId: input.id,
    action: "accepted",
    actorUserId: input.actorUserId,
    repo: target,
    number: created.value.number,
  });
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

/**
 * Dismiss a submission: archive it with a required free-text reason, no GitHub
 * mutation (SPEC §6.2). Undo appends an `undone` event and restores the row.
 */
export function dismissSubmission(input: DismissInput): Outcome<DismissResult> {
  const reason = input.reason.trim();
  if (reason.length === 0) {
    return { ok: false, status: 400, message: "A dismissal reason is required" };
  }
  if (reason.length > MAX_DISMISS_REASON) {
    return {
      ok: false,
      status: 400,
      message: `Dismissal reason must be ${MAX_DISMISS_REASON} characters or fewer`,
    };
  }

  const submission = getSubmission(input.id);
  if (!submission || submission.archivedAt !== null) {
    return { ok: false, status: 404, message: "Submission not found" };
  }

  if (!archiveSubmission(input.id, { dismissReason: reason })) {
    return { ok: false, status: 404, message: "Submission not found" };
  }
  const eventId = recordTriageEvent({
    submissionId: input.id,
    action: "dismissed",
    actorUserId: input.actorUserId,
    reason,
  });
  publish({ type: "intake", action: "dismissed", id: input.id });
  return { ok: true, value: { id: input.id, eventId } };
}

/**
 * Undo the latest dismissal: append an `undone` event and restore the row.
 * Events are never edited or deleted, so the reason and actor stay in history.
 */
export function undoTriageEvent(
  eventId: string,
  actorUserId: string,
): Outcome<{ id: string }> {
  const event = getTriageEvent(eventId);
  if (!event) {
    return { ok: false, status: 404, message: "Triage event not found" };
  }
  if (event.action !== "dismissed") {
    return {
      ok: false,
      status: 400,
      message: "Only a dismissed submission can be undone",
    };
  }
  if (latestTriageEvent(event.submissionId)?.id !== event.id) {
    return {
      ok: false,
      status: 409,
      message: "Only the latest dismissal can be undone",
    };
  }

  const submission = getSubmission(event.submissionId);
  if (!submission) {
    return { ok: false, status: 404, message: "Submission not found" };
  }
  if (!restoreSubmission(event.submissionId)) {
    return {
      ok: false,
      status: 409,
      message: "Submission is already in the queue",
    };
  }

  recordTriageEvent({
    submissionId: event.submissionId,
    action: "undone",
    actorUserId,
    repo: event.repo,
    number: event.number,
    reason: event.reason,
  });
  publish({ type: "intake", action: "undone", id: event.submissionId });
  return { ok: true, value: { id: event.submissionId } };
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
  if (!submission || submission.archivedAt !== null) {
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
  if (!getIssue(mirroredRepo.id, input.number)) {
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
        status: commented.status,
        err: commented.message,
      },
      "duplicate failed",
    );
    return commented;
  }

  archiveSubmission(input.id, {
    duplicateRepo: input.repo,
    duplicateNumber: input.number,
  });
  recordTriageEvent({
    submissionId: input.id,
    action: "duplicated",
    actorUserId: input.actorUserId,
    repo: input.repo,
    number: input.number,
  });
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
