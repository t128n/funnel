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
 * set from GitHub, swapping the sibling, and replacing the set in one `PUT`.
 */
import type { Octokit } from "octokit";
import { getConfig } from "#lib/server/config";
import {
  errorMessage,
  errorStatus,
  type Outcome,
} from "#lib/server/http/outcome";
import { createLogger } from "#lib/server/log";
import { CANONICAL_LABELS, type LabelGroup } from "#lib/server/github/labels";
import { publish } from "#lib/server/sync/events";
import { groupOf, PRIORITY_VALUES, SIZE_VALUES, STATUS_VALUES } from "./filters";

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
  /** User-token client (SPEC §8). */
  octokit: Octokit;
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
  octokit: Octokit;
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
}

export interface AddLabelsInput {
  octokit: Octokit;
  repo: string;
  number: number;
  labels: readonly string[];
}

export interface RemoveLabelInput {
  octokit: Octokit;
  repo: string;
  number: number;
  name: string;
}

export interface AddCommentInput {
  octokit: Octokit;
  repo: string;
  number: number;
  body: string;
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

/** Read the issue's authoritative label set from GitHub (names only). */
async function fetchIssueLabels(
  octokit: Octokit,
  owner: string,
  name: string,
  number: number,
): Promise<string[]> {
  const { data } = await octokit.request(
    "GET /repos/{owner}/{repo}/issues/{issue_number}",
    { owner, repo: name, issue_number: number },
  );
  const labels = (data as { labels?: Array<{ name?: string } | string> }).labels;
  return (labels ?? [])
    .map((label) => (typeof label === "string" ? label : label.name))
    .filter((label): label is string => typeof label === "string" && label.length > 0);
}

async function replaceIssueLabels(
  octokit: Octokit,
  owner: string,
  name: string,
  number: number,
  labels: readonly string[],
): Promise<string | null> {
  const { data } = await octokit.request(
    "PUT /repos/{owner}/{repo}/issues/{issue_number}/labels",
    { owner, repo: name, issue_number: number, labels: [...labels] },
  );
  return (data as { html_url?: string }).html_url ?? null;
}

function badRequest(message: string): Outcome<never> {
  return { ok: false, status: 400, message };
}

/**
 * Create a GitHub issue with the user's token (SPEC §9.2). The repo must be one
 * of the configured `funnel.config.yaml` repos so the cockpit cannot target an
 * unmapped repository.
 */
export async function createIssue(
  input: CreateIssueInput,
): Promise<Outcome<CreatedIssue>> {
  const parts = splitRepo(input.repo);
  if (!parts) return badRequest(`Invalid repository ${input.repo}`);

  const config = await getConfig();
  if (!config.repos.includes(input.repo)) {
    return badRequest(`Repository ${input.repo} is not configured`);
  }

  let labels = normalizeReserved(input.labels ?? []);
  if (input.status) labels = withReserved(labels, "status", input.status);
  if (input.priority) labels = withReserved(labels, "priority", input.priority);
  if (input.size) labels = withReserved(labels, "size", input.size);

  const params: {
    owner: string;
    repo: string;
    title: string;
    body: string;
    labels: string[];
    assignees?: string[];
  } = {
    owner: parts.owner,
    repo: parts.name,
    title: input.title,
    body: input.body ?? "",
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
      { repo: input.repo, err: errorMessage(error) },
      "create issue failed",
    );
    return { ok: false, status: errorStatus(error), message: errorMessage(error) };
  }

  const number = data.number ?? 0;
  publish({ type: "issues", repo: input.repo, numbers: [number] });
  return { ok: true, value: { number, htmlUrl: data.html_url ?? "" } };
}

/**
 * Update an issue's fields and/or reserved labels (SPEC §9.2). Field edits and
 * state changes go through `PATCH /issues/{n}`; reserved-label edits read the
 * authoritative label set and replace it, enforcing one label per group.
 */
export async function updateIssue(
  input: UpdateIssueInput,
): Promise<Outcome<UpdatedIssue>> {
  const parts = splitRepo(input.repo);
  if (!parts) return badRequest(`Invalid repository ${input.repo}`);

  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.body !== undefined) patch.body = input.body;
  if (input.assignees !== undefined) patch.assignees = [...input.assignees];
  if (input.state !== undefined) patch.state = input.state;
  if (input.stateReason !== undefined) patch.state_reason = input.stateReason;

  const reservedRequested =
    input.status !== undefined ||
    input.priority !== undefined ||
    input.size !== undefined;

  if (Object.keys(patch).length === 0 && !reservedRequested) {
    return badRequest("No changes provided");
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
      const res = await input.octokit.request(
        "PATCH /repos/{owner}/{repo}/issues/{issue_number}",
        {
          owner: parts.owner,
          repo: parts.name,
          issue_number: input.number,
          ...patch,
        },
      );
      htmlUrl = (res.data as { html_url?: string }).html_url ?? htmlUrl;
    }

    if (reservedRequested) {
      let labels = await fetchIssueLabels(
        input.octokit,
        parts.owner,
        parts.name,
        input.number,
      );
      if (input.status !== undefined) {
        labels = withReserved(labels, "status", input.status);
      }
      if (input.priority !== undefined) {
        labels = withReserved(labels, "priority", input.priority);
      }
      if (input.size !== undefined) {
        labels = withReserved(labels, "size", input.size);
      }
      const replaced = await replaceIssueLabels(
        input.octokit,
        parts.owner,
        parts.name,
        input.number,
        labels,
      );
      htmlUrl = replaced ?? htmlUrl;
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
    return { ok: false, status: errorStatus(error), message: errorMessage(error) };
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
  if (input.labels.length === 0) return badRequest("No labels provided");

  let labels: string[];
  try {
    labels = await fetchIssueLabels(
      input.octokit,
      parts.owner,
      parts.name,
      input.number,
    );
    for (const raw of input.labels) {
      const group = groupOf(raw);
      labels = group
        ? withReserved(labels, group, raw)
        : normalizeReserved([...labels, raw]);
    }
    await replaceIssueLabels(
      input.octokit,
      parts.owner,
      parts.name,
      input.number,
      labels,
    );
  } catch (error) {
    log.warn(
      { repo: input.repo, number: input.number, err: errorMessage(error) },
      "add labels failed",
    );
    return { ok: false, status: errorStatus(error), message: errorMessage(error) };
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

  try {
    await input.octokit.request(
      "DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels/{name}",
      {
        owner: parts.owner,
        repo: parts.name,
        issue_number: input.number,
        name: input.name,
      },
    );
  } catch (error) {
    log.warn(
      { repo: input.repo, number: input.number, err: errorMessage(error) },
      "remove label failed",
    );
    return { ok: false, status: errorStatus(error), message: errorMessage(error) };
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

  let data: { id?: number; html_url?: string };
  try {
    const res = await input.octokit.request(
      "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
      {
        owner: parts.owner,
        repo: parts.name,
        issue_number: input.number,
        body: input.body,
      },
    );
    data = res.data as typeof data;
  } catch (error) {
    log.warn(
      { repo: input.repo, number: input.number, err: errorMessage(error) },
      "add comment failed",
    );
    return { ok: false, status: errorStatus(error), message: errorMessage(error) };
  }

  publish({ type: "issues", repo: input.repo, numbers: [input.number] });
  return {
    ok: true,
    value: { id: data.id ?? 0, htmlUrl: data.html_url ?? "" },
  };
}
