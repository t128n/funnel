/**
 * Linked pull-request mirroring (issue #28).
 *
 * For each changed issue GitHub's `closedByPullRequestsReferences` connection
 * lists the pull requests that close it (closing keywords) or were linked to it
 * by hand. `forges` exposes that as `threads.closingPullRequests()`, including
 * the head commit's check rollup, so link discovery costs one GraphQL read per
 * changed issue and never scans every PR in the repository.
 *
 * Reviews are read from the pull request's REST reviews endpoint only when a PR
 * is new or its `updatedAt` changed; the derived decision (approved, changes
 * requested, review required) is cached on `mirror_pull_request`, as are the
 * check rollup and draft/merged state. Tracked PRs are refreshed with one
 * batched `threads.getMany()` per 100 so a merge or a new failing check reaches
 * the cockpit even when the issue itself did not change.
 *
 * Optional auto-status is opt-in per transition and writes through the normal
 * label vocabulary (never a raw GitHub label name); Done means closing the
 * issue as completed. Everything here is best-effort: a PR read failure is
 * logged and leaves the issue mirror intact.
 */
import type { RepoRef, Thread, ThreadRef } from "forges";
import type { ReservedVocabulary } from "#lib/labels";
import { clearIssueSnooze } from "#lib/server/snooze";
import type { GitHubProvider } from "#lib/server/forge/providers.server";
import { createLogger, errorFields } from "#lib/server/log";
import * as mirror from "./mirror";
import { publish } from "./events";

const log = createLogger({ component: "sync" });

/** At most 5 pages (500 linked PRs) per issue; beyond this the issue is reported. */
export const MAX_LINK_PAGES = 5;

export interface ReviewVerdict {
  /** Reviewer login; absent means the entry cannot be collapsed by author. */
  author?: string;
  /** Forge-native review state, e.g. `APPROVED` or `CHANGES_REQUESTED`. */
  state: string;
}

export interface ReviewSummary {
  decision: mirror.PullRequestRecord["reviewDecision"];
  approvedCount: number;
  changesRequestedCount: number;
}

/**
 * Collapse raw reviews to each reviewer's latest verdict. GitHub returns one
 * review per submission, so the latest state wins for repeated reviews by the
 * same person. `DISMISSED` and `PENDING` do not count as approvals.
 */
export function deriveReviewDecision(
  reviews: readonly ReviewVerdict[],
  pendingReviewCount = 0,
): ReviewSummary {
  const latest = new Map<string, string>();
  reviews.forEach((review, index) => {
    const key = review.author?.toLowerCase() ?? `anon:${index}`;
    latest.set(key, review.state.toLowerCase());
  });

  let approvedCount = 0;
  let changesRequestedCount = 0;
  let commented = false;
  for (const state of latest.values()) {
    if (state === "approved") approvedCount += 1;
    else if (state === "changes_requested") changesRequestedCount += 1;
    else if (state === "commented") commented = true;
  }

  const decision: ReviewSummary["decision"] =
    changesRequestedCount > 0
      ? "changes_requested"
      : approvedCount > 0
        ? "approved"
        : pendingReviewCount > 0
          ? "review_required"
          : commented
            ? "pending"
            : null;

  return { decision, approvedCount, changesRequestedCount };
}

/** Convert a provider actor to the mirror's user record shape. */
function toUser(
  actor: Thread["author"],
  repo: mirror.RepoRow,
): mirror.UserRecord | null {
  if (!actor?.id || !actor.login) return null;
  return {
    id: 0,
    externalId: String(actor.id),
    forge: repo.forge,
    instance: repo.instance,
    login: actor.login,
    avatarUrl: actor.avatarUrl ?? "",
    url: actor.url ?? "",
  };
}

function ms(value: Date | undefined | null): number | null {
  return value instanceof Date && !Number.isNaN(value.getTime())
    ? value.getTime()
    : null;
}

/** Normalize a provider pull request into a mirror record. */
export function normalizePullRequest(
  thread: Thread,
  repo: mirror.RepoRow,
  reviews: readonly ReviewVerdict[] = [],
  pendingReviewCount?: number,
): mirror.PullRequestRecord {
  const number = Number(thread.ref.number);
  const pending =
    pendingReviewCount ??
    thread.reviewers.filter((reviewer) => reviewer.state === "pending").length;
  const review = deriveReviewDecision(reviews, pending);
  const state =
    thread.state === "open" ||
    thread.state === "closed" ||
    thread.state === "merged"
      ? thread.state
      : "unknown";
  const checks = thread.checks
    ? {
        state: thread.checks.state,
        total: thread.checks.total ?? null,
        failed: thread.checks.failed ?? null,
        url: thread.checks.url ?? null,
      }
    : null;

  return {
    repoId: repo.id,
    number,
    externalId:
      typeof thread.ref.externalId === "string" ? thread.ref.externalId : "",
    title: thread.title,
    state,
    isDraft: thread.isDraft,
    merged: state === "merged" || thread.mergedAt instanceof Date,
    reviewDecision: review.decision,
    approvedCount: review.approvedCount,
    changesRequestedCount: review.changesRequestedCount,
    pendingReviewCount: pending,
    checks,
    url: thread.url ?? "",
    author: toUser(thread.author, repo),
    createdAt: ms(thread.createdAt) ?? 0,
    updatedAt: ms(thread.updatedAt) ?? 0,
    closedAt: ms(thread.closedAt),
    mergedAt: ms(thread.mergedAt),
  };
}

function repoRefFor(repo: mirror.RepoRow): RepoRef {
  return {
    forge: repo.forge as RepoRef["forge"],
    instance: repo.instance as RepoRef["instance"],
    owner: repo.org,
    name: repo.name,
  };
}

function threadRefFor(
  repo: mirror.RepoRow,
  kind: "issue" | "pull_request",
  number: number,
): ThreadRef {
  return {
    forge: repo.forge as ThreadRef["forge"],
    instance: repo.instance as ThreadRef["instance"],
    repo: repoRefFor(repo),
    kind,
    number: String(number),
  };
}

/** Every linked pull request GitHub reports for one issue (capped pages). */
export async function discoverLinkedPullRequests(
  provider: GitHubProvider,
  repo: mirror.RepoRow,
  issueNumber: number,
): Promise<Thread[]> {
  const issue = threadRefFor(repo, "issue", issueNumber);
  const items: Thread[] = [];
  let page = await provider.threads
    .closingPullRequests(issue, { perPage: 100 })
    .page();
  items.push(...page.items);
  for (let pages = 1; page.cursor && pages < MAX_LINK_PAGES; pages += 1) {
    page = await provider.threads
      .closingPullRequests(issue, { perPage: 100, cursor: page.cursor })
      .page();
    items.push(...page.items);
  }
  if (page.cursor) {
    log.warn(
      { repo: `${repo.org}/${repo.name}`, number: issueNumber },
      "linked pull request pagination capped",
    );
  }
  return items.filter((thread) => thread.kind === "pull_request");
}

interface RestReview {
  user?: { login?: string | null } | null;
  state?: string | null;
}

/**
 * Read a pull request's submitted reviews with one cheap REST call. Review
 * comments are irrelevant to the verdict, so this deliberately avoids
 * `threads.reviews()`, which also loads inline comments.
 */
export async function fetchReviewVerdicts(
  provider: GitHubProvider,
  repo: mirror.RepoRow,
  number: number,
): Promise<ReviewVerdict[]> {
  if (typeof provider.request !== "function") return [];
  try {
    const { data } = await provider.request<RestReview[]>(
      "GET",
      `/repos/${encodeURIComponent(repo.org)}/${encodeURIComponent(repo.name)}/pulls/${number}/reviews`,
      { query: { per_page: 100 } },
    );
    if (!Array.isArray(data)) return [];
    return data.flatMap((review) =>
      typeof review.state === "string"
        ? [
            {
              ...(review.user?.login ? { author: review.user.login } : {}),
              state: review.state,
            },
          ]
        : [],
    );
  } catch (error) {
    log.warn(
      { repo: `${repo.org}/${repo.name}`, number, ...errorFields(error) },
      "pull request reviews unavailable",
    );
    return [];
  }
}

function sameReviews(
  previous: mirror.PullRequestRow | undefined,
  review: ReviewSummary,
): boolean {
  return (
    previous !== undefined &&
    previous.reviewDecision === review.decision &&
    previous.approvedCount === review.approvedCount &&
    previous.changesRequestedCount === review.changesRequestedCount
  );
}

/**
 * Fetch reviews only when the PR is new or its `updatedAt`/state changed. A
 * stable PR keeps its cached decision, which bounds review reads to real
 * activity instead of every poll.
 */
function needsReviewRead(
  previous: mirror.PullRequestRow | undefined,
  thread: Thread,
): boolean {
  if (!previous) return true;
  return (
    previous.updatedAt !== (ms(thread.updatedAt) ?? 0) ||
    previous.state !== thread.state
  );
}

/** Apply one provider thread to the mirror, preserving cached reviews if skipped. */
async function storePullRequest(
  provider: GitHubProvider,
  repo: mirror.RepoRow,
  thread: Thread,
  previous: mirror.PullRequestRow | undefined,
): Promise<mirror.PullRequestRecord> {
  const reviews = needsReviewRead(previous, thread)
    ? await fetchReviewVerdicts(provider, repo, Number(thread.ref.number))
    : [];
  const record = normalizePullRequest(thread, repo, reviews);
  if (previous && reviews.length === 0 && !needsReviewRead(previous, thread)) {
    record.reviewDecision = previous.reviewDecision as
      | mirror.PullRequestRecord["reviewDecision"];
    record.approvedCount = previous.approvedCount;
    record.changesRequestedCount = previous.changesRequestedCount;
    record.pendingReviewCount = previous.pendingReviewCount;
  }
  return record;
}

/**
 * Refresh every already-tracked PR with one batched provider read. This is how
 * a merge, close, or failing check is picked up when the linked issue's own
 * `updatedAt` did not move.
 */
export async function refreshTrackedPullRequests(
  provider: GitHubProvider,
  repo: mirror.RepoRow,
): Promise<number> {
  const tracked = mirror.listPullRequests(repo.id);
  if (tracked.length === 0) return 0;
  if (typeof provider.threads.getMany !== "function") return 0;
  const byNumber = new Map(tracked.map((row) => [row.number, row]));
  const refs = tracked.map((row) =>
    threadRefFor(repo, "pull_request", row.number),
  );
  const results = await provider.threads.getMany(refs);
  const records: mirror.PullRequestRecord[] = [];
  for (const result of results) {
    if (!result.ok) continue;
    const thread = result.thread;
    if (thread.kind !== "pull_request") continue;
    const number = Number(thread.ref.number);
    const previous = byNumber.get(number);
    records.push(await storePullRequest(provider, repo, thread, previous));
  }
  mirror.upsertPullRequests(records);
  return records.length;
}

export interface AutoStatusOptions {
  /** Move an open issue to In Review when any linked PR is open. */
  inReview: boolean;
  /** Close an open issue when every linked PR is merged or closed. */
  done: boolean;
  vocabulary: ReservedVocabulary;
  /** Test seam; defaults to `Date.now()`. */
  now?: number;
}

/**
 * Return `labels` with the status group replaced by the configured logical
 * status. Mirrors the manual write path's group-aware normalisation without
 * importing the mutation layer (which would create a sync -> mutation cycle).
 */
export function withStatusLabel(
  labels: readonly string[],
  status: string,
  vocabulary: ReservedVocabulary,
): string[] {
  const target = vocabulary.byBase.get(status.toLowerCase());
  if (!target) return [...labels];
  const statusNames = new Set(
    vocabulary.labels
      .filter((label) => label.group === "status")
      .map((label) => label.name.toLowerCase()),
  );
  const next = labels.filter(
    (label) => !statusNames.has(label.toLowerCase()),
  );
  next.push(target.name);
  return next;
}

function sameLabelSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((value, index) => value === right[index]);
}

/**
 * Apply the opt-in PR status transitions to every issue that has a linked PR.
 * The mirror row decides whether a write is needed, so a repeated poll is a
 * no-op; the provider write is followed by an immediate mirror cache update and
 * an SSE publish. Failures are logged per issue and never fail the poll.
 */
export async function applyPullRequestStatuses(
  provider: GitHubProvider,
  repo: mirror.RepoRow,
  issueNumbers: readonly number[],
  options: AutoStatusOptions,
): Promise<number> {
  if (!options.inReview && !options.done) return 0;
  const now = options.now ?? Date.now();
  let transitions = 0;

  for (const issueNumber of issueNumbers) {
    const issue = mirror.getIssue(repo.id, issueNumber);
    if (!issue) continue;
    const pullRequests = mirror.getIssuePullRequests(repo.id, issueNumber);
    if (pullRequests.length === 0) continue;

    const hasOpen = pullRequests.some((pr) => pr.state === "open");
    const allFinished = pullRequests.every(
      (pr) => pr.state === "merged" || pr.state === "closed",
    );

    try {
      if (options.inReview && hasOpen && issue.state === "open") {
        if (issue.status === "in-review") continue;
        const labels = mirror.getIssueLabels(repo.id, issueNumber);
        const next = withStatusLabel(labels, "in-review", options.vocabulary);
        if (!sameLabelSet(labels, next)) {
          await provider.threads.setLabels(
            threadRefFor(repo, "issue", issueNumber),
            next,
          );
          mirror.replaceIssueLabels(repo.id, issueNumber, next);
        }
        mirror.setIssueStatus(repo.id, issueNumber, "in-review");
        clearIssueSnooze(`${repo.org}/${repo.name}`, issueNumber);
        publish({
          type: "issues",
          repo: `${repo.org}/${repo.name}`,
          numbers: [issueNumber],
        });
        transitions += 1;
        continue;
      }

      if (options.done && allFinished && issue.state === "open") {
        await provider.threads.close(
          threadRefFor(repo, "issue", issueNumber),
          { reason: "completed" },
        );
        mirror.markIssueClosed(repo.id, issueNumber, now);
        clearIssueSnooze(`${repo.org}/${repo.name}`, issueNumber);
        publish({
          type: "issues",
          repo: `${repo.org}/${repo.name}`,
          numbers: [issueNumber],
        });
        transitions += 1;
      }
    } catch (error) {
      log.warn(
        {
          repo: `${repo.org}/${repo.name}`,
          number: issueNumber,
          ...errorFields(error),
        },
        "pull request status transition failed",
      );
    }
  }
  return transitions;
}

export interface PullRequestSyncOptions {
  /** Auto-status is omitted when both switches are off (the default). */
  autoStatus?: Partial<Omit<AutoStatusOptions, "vocabulary">> & {
    vocabulary: ReservedVocabulary;
  };
}

export interface PullRequestSyncResult {
  /** Issues whose linked-PR set was read successfully. */
  issues: number;
  /** Pull requests persisted this cycle. */
  pullRequests: number;
  /** Auto-status writes that actually changed an issue. */
  transitions: number;
}

/**
 * Discover links for the changed issues, refresh all tracked PRs, prune links
 * that no longer exist, then apply opt-in status transitions.
 */
export async function syncPullRequestsForIssues(
  provider: GitHubProvider,
  repo: mirror.RepoRow,
  issueNumbers: readonly number[],
  options: PullRequestSyncOptions = {},
): Promise<PullRequestSyncResult> {
  let issues = 0;

  if (typeof provider.threads.closingPullRequests === "function") {
    const previous = new Map(
      mirror.listPullRequests(repo.id).map((row) => [row.number, row]),
    );
    for (const issueNumber of issueNumbers) {
      let linked: Thread[];
      try {
        linked = await discoverLinkedPullRequests(provider, repo, issueNumber);
      } catch (error) {
        log.warn(
          {
            repo: `${repo.org}/${repo.name}`,
            number: issueNumber,
            ...errorFields(error),
          },
          "linked pull request discovery failed",
        );
        continue;
      }

      const links: Array<{
        prNumber: number;
        source: "closing" | "cross-reference";
      }> = [];
      const records: mirror.PullRequestRecord[] = [];
      for (const thread of linked) {
        const number = Number(thread.ref.number);
        if (!Number.isInteger(number)) continue;
        links.push({ prNumber: number, source: "closing" });
        records.push(
          await storePullRequest(
            provider,
            repo,
            thread,
            previous.get(number),
          ),
        );
      }
      mirror.upsertPullRequests(records);
      mirror.replaceIssuePullRequestLinks(repo.id, issueNumber, links);
      issues += 1;
    }
  }

  await refreshTrackedPullRequests(provider, repo);
  mirror.pruneOrphanPullRequests(repo.id);
  const pullRequests = mirror.listPullRequests(repo.id).length;

  let transitions = 0;
  if (options.autoStatus) {
    const { vocabulary, ...switches } = options.autoStatus;
    transitions = await applyPullRequestStatuses(
      provider,
      repo,
      mirror.linkedIssueNumbers(repo.id),
      {
        inReview: switches.inReview ?? false,
        done: switches.done ?? false,
        vocabulary,
        now: switches.now,
      },
    );
  }

  return { issues, pullRequests, transitions };
}
