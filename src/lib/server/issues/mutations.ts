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
 * Reserved-label edits are group-aware: status/priority/size are kept to at most
 * one label per group (SPEC §5.2.1) by reading the issue's authoritative label
 * set from the forge, swapping the sibling, and replacing the set in one call.
 */
import type { Thread, ThreadInput, ThreadRef, ThreadUpdate } from "forges";
import { getConfig, isConfiguredRepo } from "#lib/server/config";
import { forge, type GitHubProvider } from "#lib/server/forge/providers.server";
import {
  errorMessage,
  errorStatus,
  type Outcome,
} from "#lib/server/http/outcome";
import { createLogger } from "#lib/server/log";
import { CANONICAL_LABELS, type LabelGroup } from "#lib/server/github/labels";
import { createRepoMilestone } from "#lib/server/github/milestones";
import { publish } from "#lib/server/sync/events";
import {
  groupOf,
  PRIORITY_VALUES,
  SIZE_VALUES,
  STATUS_VALUES,
} from "./filters";

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
  priority?: string;
  size?: string;
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
  priority?: string | null;
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

const GROUP_VALUES: Record<LabelGroup, ReadonlySet<string>> = {
  status: new Set(STATUS_VALUES),
  priority: new Set(PRIORITY_VALUES),
  size: new Set(SIZE_VALUES),
  flags: new Set(
    CANONICAL_LABELS.filter((label) => label.group === "flags").map((label) =>
      label.name.toLowerCase(),
    ),
  ),
};

function isCanonical(group: LabelGroup, value: string): boolean {
  return GROUP_VALUES[group].has(value.toLowerCase());
}

/** Every canonical label name in a group, lowercased. */
function groupMembers(group: LabelGroup): Set<string> {
  return new Set(
    CANONICAL_LABELS.filter((label) => label.group === group).map((label) =>
      label.name.toLowerCase(),
    ),
  );
}

/** Keep the first label of each reserved group; de-duplicate case-insensitively. */
export function normalizeReserved(labels: readonly string[]): string[] {
  const seen = new Set<string>();
  const seenGroups = new Set<LabelGroup>();
  const out: string[] = [];
  for (const raw of labels) {
    const lower = raw.toLowerCase();
    if (seen.has(lower)) continue;
    const group = groupOf(lower);
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
 * (canonical name, or `null` to just clear the group) appended.
 */
export function withReserved(
  labels: readonly string[],
  group: LabelGroup,
  target: string | null,
): string[] {
  const members = groupMembers(group);
  const filtered = labels.filter((label) => !members.has(label.toLowerCase()));
  if (target) filtered.push(target.toLowerCase());
  return normalizeReserved(filtered);
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

  let labels = normalizeReserved(input.labels ?? []);
  if (input.status) labels = withReserved(labels, "status", input.status);
  if (input.priority) labels = withReserved(labels, "priority", input.priority);
  if (input.size) labels = withReserved(labels, "size", input.size);

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
      { repo: input.repo, err: errorMessage(error) },
      "create issue failed",
    );
    return {
      ok: false,
      status: errorStatus(error),
      message: errorMessage(error),
    };
  }

  const number = Number(created.ref.number);
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
    input.priority !== undefined ||
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
    ["priority", input.priority],
    ["size", input.size],
  ] as const) {
    if (value !== undefined && value !== null && !isCanonical(group, value)) {
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
        labels = withReserved(labels, "status", input.status);
      }
      if (input.priority !== undefined) {
        labels = withReserved(labels, "priority", input.priority);
      }
      if (input.size !== undefined) {
        labels = withReserved(labels, "size", input.size);
      }
      if (input.blocked !== undefined) {
        labels = withReserved(
          labels,
          "flags",
          input.blocked ? "blocked" : null,
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
        err: errorMessage(error),
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

  const ref = forge.threadRef(
    forge.repoRef(parts.owner, parts.name),
    "issue",
    input.number,
  );

  try {
    let labels = await fetchIssueLabels(input.provider, ref);
    for (const raw of input.labels) {
      const group = groupOf(raw);
      labels = group
        ? withReserved(labels, group, raw)
        : normalizeReserved([...labels, raw]);
    }
    await replaceIssueLabels(input.provider, ref, labels);
  } catch (error) {
    log.warn(
      { repo: input.repo, number: input.number, err: errorMessage(error) },
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
      { repo: input.repo, number: input.number, err: errorMessage(error) },
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
      { repo: input.repo, number: input.number, err: errorMessage(error) },
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
    publish({ type: "issues", repo: input.repo, numbers: [] });
    return {
      ok: true,
      value: { number: milestone.number, htmlUrl: milestone.htmlUrl },
    };
  } catch (error) {
    log.warn(
      { repo: input.repo, err: errorMessage(error) },
      "create milestone failed",
    );
    return {
      ok: false,
      status: errorStatus(error),
      message: errorMessage(error),
    };
  }
}
