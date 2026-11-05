/**
 * Pessimistic issue mutations (SPEC §1.4, §8, §9.2).
 *
 * Transport-agnostic actions behind the write endpoints. Every write runs with
 * the signed-in user's token — GitHub enforces repository permissions natively
 * — and only succeeds once GitHub confirms. On success a local `issues` event is
 * published so the cockpit can react; the route layer additionally schedules a
 * background {@link refreshIssue} (SPEC §7.2), keeping the mirror fresh without
 * blocking the response.
 *
 * Reserved-label edits are group-aware: status/impact/urgency/size are kept to
 * at most one label per group (SPEC §5.2.1) by reading the issue's
 * authoritative label set from the forge, swapping the sibling, and replacing
 * the set in one call. Priority is derived from impact × urgency and carries no
 * label; retired p-labels are refused or stripped from new writes.
 */
import type {
  CommentRef,
  ReactionContent,
  Thread,
  ThreadInput,
  ThreadRef,
  ThreadUpdate,
} from "forges";
import { getConfig, isConfiguredRepo } from "#lib/server/config";
import { DEFAULT_VOCABULARY, type LabelGroup, type ReservedVocabulary } from "#lib/labels";
import { vocabularyFor } from "#lib/server/label-vocabulary";
import { forge, type GitHubProvider } from "#lib/server/forge/providers.server";
import {
  errorMessage,
  errorStatus,
  type Outcome,
} from "#lib/server/http/outcome";
import { createLogger, errorFields } from "#lib/server/log";
import { createRepoMilestone } from "#lib/server/github/milestones";
import { publish } from "#lib/server/sync/events";
import { clearIssueSnooze } from "#lib/server/snooze";
import { isRetiredPriorityLabel } from "#lib/priority";
import { groupOf } from "./filters";

const log = createLogger({ component: "issues" });

export interface CreatedIssue {
  number: number;
  htmlUrl: string;
}

export interface UpdatedIssue {
  number: number;
  htmlUrl: string;
}

export interface AddedComment {
  id: number;
  htmlUrl: string;
}

export interface CreateIssueInput {
  /** User-token provider (SPEC §8). */
  provider: GitHubProvider;
  /** Target repo in `owner/name` form. */
  repo: string;
  title: string;
  body?: string;
  /** Additional labels (reserved labels are normalised to one per group). */
  labels?: readonly string[];
  assignees?: readonly string[];
  /** Convenience reserved-label shortcuts. */
  status?: string;
  impact?: string;
  urgency?: string;
  size?: string;
  /** GitHub issue type name, when the host/repo supports issue types. */
  issueType?: string;
}

export interface UpdateIssueInput {
  provider: GitHubProvider;
  repo: string;
  number: number;
  title?: string;
  body?: string;
  assignees?: readonly string[];
  state?: "open" | "closed";
  stateReason?: "completed" | "not_planned" | null;
  /** `null` clears the label; `undefined` leaves the group untouched. */
  status?: string | null;
  impact?: string | null;
  urgency?: string | null;
  size?: string | null;
  /** Toggles the orthogonal `blocked` flag (SPEC §5.1). */
  blocked?: boolean;
  /** `null` clears the milestone; `undefined` leaves it untouched. */
  milestone?: number | null;
}

export interface AddLabelsInput {
  provider: GitHubProvider;
  repo: string;
  number: number;
  labels: readonly string[];
}

export interface RemoveLabelInput {
  provider: GitHubProvider;
  repo: string;
  number: number;
  name: string;
}

export interface AddCommentInput {
  provider: GitHubProvider;
  repo: string;
  number: number;
  body: string;
}

export interface CommentTarget {
  provider: GitHubProvider;
  repo: string;
  number: number;
  /** Forge-native comment database id (mirrored as `externalId`). */
  commentId: number;
}

export interface UpdateCommentInput extends CommentTarget {
  body: string;
}

export interface CommentReactionInput extends CommentTarget {
  content: ReactionContent;
}

export interface UpdatedComment {
  id: number;
  htmlUrl: string;
  updatedAt: number | null;
}

export interface DeletedComment {
  id: number;
}

export interface CommentReactionResult {
  id: number;
  content: ReactionContent;
  reacted: boolean;
}

export interface CreateMilestoneInput {
  provider: GitHubProvider;
  repo: string;
  title: string;
  description?: string;
  /** ISO date (`YYYY-MM-DD`). */
  dueOn?: string | null;
}

/** Split `owner/name`; `null` when malformed. */
function splitRepo(repo: string): { owner: string; name: string } | null {
  const slash = repo.indexOf("/");
  if (slash <= 0 || slash === repo.length - 1) return null;
  return { owner: repo.slice(0, slash), name: repo.slice(slash + 1) };
}

/** Every logical value in a group, lowercased. */
function groupValues(
  group: LabelGroup,
  vocabulary: ReservedVocabulary,
): ReadonlySet<string> {
  if (group === "priority") return new Set<string>();
  return new Set(
    vocabulary.labels
      .filter((label) => label.group === group)
      .map((label) => label.base.toLowerCase()),
  );
}

function isCanonical(
  group: LabelGroup,
  value: string,
  vocabulary: ReservedVocabulary,
): boolean {
  return groupValues(group, vocabulary).has(value.toLowerCase());
}

/** Every actual label name in a group, lowercased. */
function groupMembers(
  group: LabelGroup,
  vocabulary: ReservedVocabulary,
): Set<string> {
  return new Set(
    vocabulary.labels
      .filter((label) => label.group === group)
      .map((label) => label.name.toLowerCase()),
  );
}

/** Keep the first label of each reserved group; de-duplicate case-insensitively. */
export function normalizeReserved(
  labels: readonly string[],
  vocabulary: ReservedVocabulary = DEFAULT_VOCABULARY,
): string[] {
  const seen = new Set<string>();
  const seenGroups = new Set<LabelGroup>();
  const out: string[] = [];
  for (const raw of labels) {
    const lower = raw.toLowerCase();
    if (seen.has(lower)) continue;
    const group = groupOf(lower, vocabulary);
    if (group) {
      if (seenGroups.has(group)) continue;
      seenGroups.add(group);
    }
    seen.add(lower);
    out.push(raw);
  }
  return out;
}

/**
 * Return `labels` with the reserved group's labels removed and `target`
 * (a logical key, or `null` to just clear the group) appended as its actual
 * GitHub name.
 */
export function withReserved(
  labels: readonly string[],
  group: LabelGroup,
  target: string | null,
  vocabulary: ReservedVocabulary = DEFAULT_VOCABULARY,
): string[] {
  const members = groupMembers(group, vocabulary);
  const filtered = labels.filter((label) => !members.has(label.toLowerCase()));
  if (target) {
    const entry =
      vocabulary.byBase.get(target.toLowerCase()) ??
      vocabulary.byName.get(target.toLowerCase());
    filtered.push(entry?.name ?? target.toLowerCase());
  }
  return normalizeReserved(filtered, vocabulary);
}

/** Read the issue's authoritative label set from the forge (names only). */
async function fetchIssueLabels(
  provider: GitHubProvider,
  ref: ThreadRef,
): Promise<string[]> {
  const thread = await provider.threads.get(ref);
  return thread.labels
    .map((label) => label.name)
    .filter((name) => name.length > 0);
}

/**
 * Replace the issue's labels, keeping the group-aware set the caller built.
 * Returns the issue's web URL where the provider can build one.
 */
async function replaceIssueLabels(
  provider: GitHubProvider,
  ref: ThreadRef,
  labels: readonly string[],
): Promise<string> {
  await provider.threads.setLabels(ref, [...labels]);
  const urlFor = provider.urlFor;
  return typeof urlFor === "function" ? (urlFor({ thread: ref }) ?? "") : "";
}

function badRequest(message: string): Outcome<never> {
  return { ok: false, status: 400, message };
}

/**
 * Guard every write against a repo that isn't one of the configured
 * instance settings repos, so the cockpit can never target an unmapped
 * repository. Returns a ready `Outcome` failure, or `null` when allowed.
 */
async function requireConfiguredRepo(
  repo: string,
): Promise<Outcome<never> | null> {
  const config = await getConfig();
  return isConfiguredRepo(config, repo)
    ? null
    : badRequest(`Repository ${repo} is not configured`);
}

/**
 * Create a GitHub issue with the user's token (SPEC §9.2). The repo must be one
 * of the configured instance settings repos so the cockpit cannot target an
 * unmapped repository.
 */
export async function createIssue(
  input: CreateIssueInput,
): Promise<Outcome<CreatedIssue>> {
  const parts = splitRepo(input.repo);
  if (!parts) return badRequest(`Invalid repository ${input.repo}`);

  const notConfigured = await requireConfiguredRepo(input.repo);
  if (notConfigured) return notConfigured;

  const vocabulary = vocabularyFor((await getConfig()).labels.prefix);

  let labels = normalizeReserved(
    (input.labels ?? []).filter((label) => !isRetiredPriorityLabel(label)),
    vocabulary,
  );
  if (input.status) {
    labels = withReserved(labels, "status", input.status, vocabulary);
  }
  if (input.impact) {
    labels = withReserved(labels, "impact", input.impact, vocabulary);
  }
  if (input.urgency) {
    labels = withReserved(labels, "urgency", input.urgency, vocabulary);
  }
  if (input.size) {
    labels = withReserved(labels, "size", input.size, vocabulary);
  }

  const thread: ThreadInput = {
    kind: "issue",
    title: input.title,
    body: input.body ?? "",
    labels,
  };
  if (input.assignees && input.assignees.length > 0) {
    thread.assignees = [...input.assignees];
  }

  let created: Thread;
  try {
    created = await input.provider.threads.create(
      forge.repoRef(parts.owner, parts.name),
      thread,
    );
  } catch (error) {
    log.warn(
      { repo: input.repo, ...errorFields(error) },
      "create issue failed",
    );
    return {
      ok: false,
      status: errorStatus(error),
      message: errorMessage(error),
    };
  }

  const number = Number(created.ref.number);

  // GitHub's REST create path ignores `ThreadInput.issueType`, so set it in a
  // follow-up write. The issue already exists at this point: a rejected type
  // write is logged and leaves the successful create intact.
  const issueType = input.issueType?.trim();
  if (issueType) {
    try {
      await input.provider.threads.setIssueType(created.ref, issueType);
    } catch (error) {
      log.warn(
        { repo: input.repo, number, issueType, ...errorFields(error) },
        "create issue type write failed",
      );
    }
  }

  publish({ type: "issues", repo: input.repo, numbers: [number] });
  return { ok: true, value: { number, htmlUrl: created.url ?? "" } };
}

/**
 * Update an issue's fields and/or reserved labels (SPEC §9.2). Field edits go
 * through `threads.update`, a close through `threads.close` (so the reason is
 * kept), the milestone through `threads.setMilestone`, and reserved-label edits
 * read the authoritative label set and replace it, enforcing one label per
 * group.
 */
export async function updateIssue(
  input: UpdateIssueInput,
): Promise<Outcome<UpdatedIssue>> {
  const parts = splitRepo(input.repo);
  if (!parts) return badRequest(`Invalid repository ${input.repo}`);

  const notConfigured = await requireConfiguredRepo(input.repo);
  if (notConfigured) return notConfigured;

  const vocabulary = vocabularyFor((await getConfig()).labels.prefix);

  const ref = forge.threadRef(
    forge.repoRef(parts.owner, parts.name),
    "issue",
    input.number,
  );

  const patch: ThreadUpdate = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.body !== undefined) patch.body = input.body;
  if (input.assignees !== undefined) patch.assignees = [...input.assignees];
  if (input.state === "open") patch.state = "open";

  const closing = input.state === "closed";

  const reservedRequested =
    input.status !== undefined ||
    input.impact !== undefined ||
    input.urgency !== undefined ||
    input.size !== undefined ||
    input.blocked !== undefined;

  const changed =
    input.title !== undefined ||
    input.body !== undefined ||
    input.assignees !== undefined ||
    input.state !== undefined ||
    input.milestone !== undefined ||
    reservedRequested;

  if (!changed) {
    return badRequest("No changes provided");
  }

  if (
    input.milestone !== undefined &&
    input.milestone !== null &&
    (!Number.isInteger(input.milestone) || input.milestone <= 0)
  ) {
    return badRequest(`Invalid milestone: ${input.milestone}`);
  }

  for (const [group, value] of [
    ["status", input.status],
    ["impact", input.impact],
    ["urgency", input.urgency],
    ["size", input.size],
  ] as const) {
    if (value !== undefined && value !== null && !isCanonical(group, value, vocabulary)) {
      return badRequest(`Invalid ${group} value: ${value}`);
    }
  }

  let htmlUrl: string | undefined;
  try {
    if (Object.keys(patch).length > 0) {
      const updated = await input.provider.threads.update(ref, patch);
      htmlUrl = updated.url ?? htmlUrl;
    }

    if (closing) {
      const closed = await input.provider.threads.close(ref, {
        reason: input.stateReason ?? undefined,
      });
      htmlUrl = closed.url ?? htmlUrl;
    }

    if (input.milestone !== undefined) {
      // `forges` takes a milestone by id, title, or a string of its number.
      await input.provider.threads.setMilestone(
        ref,
        input.milestone === null ? undefined : String(input.milestone),
      );
    }

    if (reservedRequested) {
      let labels = await fetchIssueLabels(input.provider, ref);
      if (input.status !== undefined) {
        labels = withReserved(labels, "status", input.status, vocabulary);
      }
      if (input.impact !== undefined) {
        labels = withReserved(labels, "impact", input.impact, vocabulary);
      }
      if (input.urgency !== undefined) {
        labels = withReserved(labels, "urgency", input.urgency, vocabulary);
      }
      if (input.size !== undefined) {
        labels = withReserved(labels, "size", input.size, vocabulary);
      }
      if (input.blocked !== undefined) {
        labels = withReserved(
          labels,
          "flags",
          input.blocked ? "blocked" : null,
          vocabulary,
        );
      }
      const replaced = await replaceIssueLabels(input.provider, ref, labels);
      if (replaced) htmlUrl = replaced;
    }
  } catch (error) {
    log.warn(
      {
        repo: input.repo,
        number: input.number,
        ...errorFields(error),
      },
      "update issue failed",
    );
    // This path may have made several writes (update, close, milestone,
    // labels); earlier ones are already applied when a later one fails.
    return {
      ok: false,
      status: errorStatus(error),
      message: `${errorMessage(error)} (some changes may already have been applied)`,
    };
  }

  // A triage/status write moves the issue out of the Inbox; its snooze has
  // served its purpose and must not resurface it later.
  if (input.status !== undefined) {
    clearIssueSnooze(input.repo, input.number);
  }
  publish({ type: "issues", repo: input.repo, numbers: [input.number] });
  return {
    ok: true,
    value: { number: input.number, htmlUrl: htmlUrl ?? "" },
  };
}

/**
 * Add one or more labels (SPEC §5.2.5). Reserved additions are group-aware: the
 * sibling in that group is swapped out so at most one remains.
 */
export async function addIssueLabels(
  input: AddLabelsInput,
): Promise<Outcome<{ labels: string[] }>> {
  const parts = splitRepo(input.repo);
  if (!parts) return badRequest(`Invalid repository ${input.repo}`);

  const notConfigured = await requireConfiguredRepo(input.repo);
  if (notConfigured) return notConfigured;

  if (input.labels.length === 0) return badRequest("No labels provided");
  if (input.labels.some((label) => isRetiredPriorityLabel(label))) {
    return badRequest("Priority labels are retired; set impact and urgency instead");
  }

  const vocabulary = vocabularyFor((await getConfig()).labels.prefix);

  const ref = forge.threadRef(
    forge.repoRef(parts.owner, parts.name),
    "issue",
    input.number,
  );

  try {
    let labels = await fetchIssueLabels(input.provider, ref);
    for (const raw of input.labels) {
      const group = groupOf(raw, vocabulary);
      labels = group
        ? withReserved(labels, group, raw, vocabulary)
        : normalizeReserved([...labels, raw], vocabulary);
    }
    await replaceIssueLabels(input.provider, ref, labels);
  } catch (error) {
    log.warn(
      { repo: input.repo, number: input.number, ...errorFields(error) },
      "add labels failed",
    );
    return {
      ok: false,
      status: errorStatus(error),
      message: errorMessage(error),
    };
  }

  publish({ type: "issues", repo: input.repo, numbers: [input.number] });
  return { ok: true, value: { labels: [...input.labels] } };
}

/** Remove a single label from an issue (SPEC §5.2.5). */
export async function removeIssueLabel(
  input: RemoveLabelInput,
): Promise<Outcome<{ name: string }>> {
  const parts = splitRepo(input.repo);
  if (!parts) return badRequest(`Invalid repository ${input.repo}`);

  const notConfigured = await requireConfiguredRepo(input.repo);
  if (notConfigured) return notConfigured;

  const ref = forge.threadRef(
    forge.repoRef(parts.owner, parts.name),
    "issue",
    input.number,
  );

  try {
    await input.provider.threads.removeLabels(ref, [input.name]);
  } catch (error) {
    log.warn(
      { repo: input.repo, number: input.number, ...errorFields(error) },
      "remove label failed",
    );
    return {
      ok: false,
      status: errorStatus(error),
      message: errorMessage(error),
    };
  }

  publish({ type: "issues", repo: input.repo, numbers: [input.number] });
  return { ok: true, value: { name: input.name } };
}

/** Post a new comment on an issue (SPEC §9.2). */
export async function addIssueComment(
  input: AddCommentInput,
): Promise<Outcome<AddedComment>> {
  const parts = splitRepo(input.repo);
  if (!parts) return badRequest(`Invalid repository ${input.repo}`);

  const notConfigured = await requireConfiguredRepo(input.repo);
  if (notConfigured) return notConfigured;

  const ref = forge.threadRef(
    forge.repoRef(parts.owner, parts.name),
    "issue",
    input.number,
  );

  let comment: { ref?: { id?: string }; id?: string; url?: string };
  try {
    comment = await input.provider.threads.createComment(ref, input.body);
  } catch (error) {
    log.warn(
      { repo: input.repo, number: input.number, ...errorFields(error) },
      "add comment failed",
    );
    return {
      ok: false,
      status: errorStatus(error),
      message: errorMessage(error),
    };
  }

  const id = comment.ref?.id ?? comment.id;
  publish({ type: "issues", repo: input.repo, numbers: [input.number] });
  return {
    ok: true,
    value: { id: Number(id), htmlUrl: comment.url ?? "" },
  };
}

/**
 * Build the provider ref for one comment. GitHub identifies a comment by its
 * database id, which the mirror stores as `mirror_comment.external_id`.
 */
function commentRef(
  repo: { owner: string; name: string },
  number: number,
  commentId: number,
): CommentRef {
  const thread = forge.threadRef(
    forge.repoRef(repo.owner, repo.name),
    "issue",
    number,
  );
  return {
    forge: thread.forge,
    instance: thread.instance,
    thread,
    id: String(commentId),
  };
}

/**
 * GitHub is authoritative for who may edit, delete or react to a comment.
 * Forward its status, but make a permission rejection legible: the raw REST
 * body ("Resource not accessible by integration") does not tell the reader
 * that their GitHub role, not Funnel's, refused the write.
 */
function commentFailure(
  action: string,
  commentId: number,
  error: unknown,
): Outcome<never> {
  const status = errorStatus(error);
  if (status === 403) {
    return {
      ok: false,
      status,
      message: `GitHub denied permission to ${action} comment ${commentId}. Check your access to this repository on GitHub. (${errorMessage(error)})`,
    };
  }
  if (status === 404) {
    return {
      ok: false,
      status,
      message: `Comment ${commentId} was not found on GitHub, or you do not have permission to ${action} it.`,
    };
  }
  return { ok: false, status, message: errorMessage(error) };
}

/** Edit one issue comment with the signed-in user's token. */
export async function updateIssueComment(
  input: UpdateCommentInput,
): Promise<Outcome<UpdatedComment>> {
  const parts = splitRepo(input.repo);
  if (!parts) return badRequest(`Invalid repository ${input.repo}`);
  if (!Number.isInteger(input.commentId) || input.commentId <= 0) {
    return badRequest(`Invalid comment id: ${input.commentId}`);
  }

  const notConfigured = await requireConfiguredRepo(input.repo);
  if (notConfigured) return notConfigured;

  const ref = commentRef(parts, input.number, input.commentId);
  try {
    const comment = await input.provider.threads.updateComment(ref, input.body);
    publish({ type: "issues", repo: input.repo, numbers: [input.number] });
    return {
      ok: true,
      value: {
        id: input.commentId,
        htmlUrl: comment.url ?? "",
        updatedAt: comment.updatedAt?.getTime() ?? null,
      },
    };
  } catch (error) {
    log.warn(
      { repo: input.repo, number: input.number, commentId: input.commentId, ...errorFields(error) },
      "update comment failed",
    );
    return commentFailure("edit", input.commentId, error);
  }
}

/** Delete one issue comment with the signed-in user's token. */
export async function deleteIssueComment(
  input: CommentTarget,
): Promise<Outcome<DeletedComment>> {
  const parts = splitRepo(input.repo);
  if (!parts) return badRequest(`Invalid repository ${input.repo}`);
  if (!Number.isInteger(input.commentId) || input.commentId <= 0) {
    return badRequest(`Invalid comment id: ${input.commentId}`);
  }

  const notConfigured = await requireConfiguredRepo(input.repo);
  if (notConfigured) return notConfigured;

  const ref = commentRef(parts, input.number, input.commentId);
  try {
    await input.provider.threads.deleteComment(ref);
    publish({ type: "issues", repo: input.repo, numbers: [input.number] });
    return { ok: true, value: { id: input.commentId } };
  } catch (error) {
    log.warn(
      { repo: input.repo, number: input.number, commentId: input.commentId, ...errorFields(error) },
      "delete comment failed",
    );
    return commentFailure("delete", input.commentId, error);
  }
}

/**
 * Add or remove one reaction on a comment. `forges` addresses a reaction by
 * content rather than by reaction id, so no per-reaction identity has to be
 * mirrored; GitHub removes the authenticated account's matching reaction.
 */
export async function setCommentReaction(
  input: CommentReactionInput & { active: boolean },
): Promise<Outcome<CommentReactionResult>> {
  const parts = splitRepo(input.repo);
  if (!parts) return badRequest(`Invalid repository ${input.repo}`);
  if (!Number.isInteger(input.commentId) || input.commentId <= 0) {
    return badRequest(`Invalid comment id: ${input.commentId}`);
  }

  const notConfigured = await requireConfiguredRepo(input.repo);
  if (notConfigured) return notConfigured;

  const ref = commentRef(parts, input.number, input.commentId);
  try {
    if (input.active) {
      await input.provider.threads.react(ref, input.content);
    } else {
      await input.provider.threads.unreact(ref, input.content);
    }
    publish({ type: "issues", repo: input.repo, numbers: [input.number] });
    return {
      ok: true,
      value: {
        id: input.commentId,
        content: input.content,
        reacted: input.active,
      },
    };
  } catch (error) {
    log.warn(
      {
        repo: input.repo,
        number: input.number,
        commentId: input.commentId,
        content: input.content,
        ...errorFields(error),
      },
      "comment reaction failed",
    );
    return commentFailure(
      input.active ? "react to" : "remove a reaction from",
      input.commentId,
      error,
    );
  }
}

/**
 * Create a milestone in one repository with the signed-in user's token. This is
 * the "lazy create" path: Funnel only ever creates a milestone because someone
 * assigned it to an issue, and GitHub scopes milestones per repo, so creating it
 * in each repo an issue uses is how a milestone spans repositories.
 */
export async function createMilestone(
  input: CreateMilestoneInput,
): Promise<Outcome<CreatedIssue>> {
  const parts = splitRepo(input.repo);
  if (!parts) return badRequest(`Invalid repository ${input.repo}`);

  const notConfigured = await requireConfiguredRepo(input.repo);
  if (notConfigured) return notConfigured;

  const title = input.title.trim();
  if (title.length === 0) return badRequest("Milestone title is required");

  try {
    const milestone = await createRepoMilestone(
      input.provider,
      parts.owner,
      parts.name,
      {
        title,
        description: input.description,
        dueOn: input.dueOn ?? undefined,
      },
    );
    return {
      ok: true,
      value: { number: milestone.number, htmlUrl: milestone.url },
    };
  } catch (error) {
    log.warn(
      { repo: input.repo, ...errorFields(error) },
      "create milestone failed",
    );
    return {
      ok: false,
      status: errorStatus(error),
      message: errorMessage(error),
    };
  }
}
