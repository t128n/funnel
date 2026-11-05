/**
 * Conditional polling worker (SPEC §7.2).
 *
 * Per repo, Funnel asks the installation provider for issues updated since the
 * newest mirrored `updated_at` (SPEC §7.2, derived rather than stored), carrying
 * the stored ETag as `cursor.etag`. `forges` turns an unchanged feed into
 * `page.notModified` instead of a thrown 304, so quiet polls stay cheap; after a
 * change is hydrated the cursor advances and the next poll is one 200 before
 * notModified resumes.
 *
 * Changed issues are hydrated in GraphQL batches (100/query) and reserved-label
 * conflicts are resolved with the App installation token. Cadence is 30s per
 * repo while any SSE client is connected, backing off to 300s when idle
 * (`sync.poll_interval_active_seconds` / `sync.poll_interval_idle_seconds`).
 *
 * The scheduler starts once per process (adapter-node) and never blocks
 * startup: `startSyncWorker` returns immediately.
 */
import type { Thread, ThreadQuery } from "forges";
import { configuredRepoSlugs, getConfig } from "#/lib/server/config";
import { createLogger, errorFields } from "#/lib/server/log";
import {
  forge,
  type GitHubProvider,
} from "#/lib/server/forge/providers.server";
import { vocabularyFor } from "#/lib/server/label-vocabulary";
import { listRepoLabels } from "#/lib/server/github/labels";
import { listRepoMilestones } from "#/lib/server/github/milestones";
import { listRepoAssignees } from "#/lib/server/github/assignees";
import { retiredPriorityConflict } from "#lib/priority";
import type { ReservedVocabulary } from "#lib/labels";
import { deriveMetadata, resolveIssueConflict } from "./conflicts";
import { clientCount, publish } from "./events";
import { hydrateAndStore } from "./hydrate";
import * as mirror from "./mirror";

const log = createLogger({ component: "sync" });

const PER_PAGE = 100;
const DAY_MS = 86_400_000;
/** How often the scheduler wakes to check which repos are due. */
const TICK_MS = 5_000;

/** The subset of a provider thread the poller needs (times in epoch ms). */
export interface HistoryThread {
  state: string;
  closedAt?: number | null;
}

export interface PollOptions {
  /** Ignore the cursor and list every issue (nightly reconciliation). */
  full?: boolean;
}

export interface PollResult {
  notModified: boolean;
  /** Non-PR issues returned by GitHub that fall inside the history window. */
  changed: number;
  /** Records actually hydrated and stored. */
  hydrated: number;
  /** Mirror rows dropped because the issue aged out of the history window. */
  pruned: number;
  /** Issues whose reserved-label conflicts were processed. */
  conflicts: number;
  /** Issue numbers seen inside the window (reconciliation prune input). */
  seenNumbers: number[];
}

/** Open issues, plus closed issues within `sync.history_days` (SPEC §7.1). */
export function inHistoryWindow(
  thread: HistoryThread,
  cutoff: number,
): boolean {
  if (thread.state === "open") return true;
  if (thread.state === "closed" && typeof thread.closedAt === "number") {
    return !Number.isNaN(thread.closedAt) && thread.closedAt >= cutoff;
  }
  return false;
}

/**
 * Resolve reserved-label conflicts for hydrated records (SPEC §5.2.2). Writes
 * run as `funnel[bot]`; ambiguous timelines are flagged instead of changed.
 */
async function resolveConflicts(
  provider: GitHubProvider,
  repo: mirror.RepoRow,
  records: readonly mirror.IssueRecord[],
  vocabulary: ReservedVocabulary,
): Promise<number> {
  const repoRef = forge.repoRef(repo.org, repo.name);
  let processed = 0;
  for (const record of records) {
    const derived = deriveMetadata(record.labels, vocabulary);
    if (derived.conflicts.length === 0) continue;
    const resolved = await resolveIssueConflict(
      provider,
      repoRef,
      record.number,
      record.labels,
      vocabulary,
    );
    const removed = new Set(
      resolved.removed.map((name) => name.toLowerCase()),
    );
    const remaining = record.labels.filter(
      (name) => !removed.has(name.toLowerCase()),
    );
    mirror.setIssueMetadata(repo.id, record.number, {
      status: resolved.metadata.status,
      impact: resolved.metadata.impact,
      urgency: resolved.metadata.urgency,
      priority: resolved.metadata.priority,
      size: resolved.metadata.size,
      blocked: resolved.metadata.blocked,
      isEpic: resolved.metadata.isEpic,
      labelConflict:
        resolved.ambiguous ||
        retiredPriorityConflict(resolved.metadata.priority, remaining),
    });
    if (resolved.removed.length > 0) {
      mirror.replaceIssueLabels(repo.id, record.number, remaining);
    }
    processed += 1;
  }
  return processed;
}

/**
 * One conditional poll of a single repo. Exported for tests, which drive it
 * directly and never start the scheduler.
 */
export async function pollRepo(
  repo: mirror.RepoRow,
  installationId: number,
  now = Date.now(),
  options: PollOptions = {},
): Promise<PollResult> {
  const config = await getConfig();
  const { sync } = config;
  const vocabulary = vocabularyFor(config.labels.prefix);
  const provider = await forge.installationProvider(installationId);
  const repoRef = forge.repoRef(repo.org, repo.name);
  const cursor = options.full ? null : mirror.getRepoCursor(repo.id);

  const query: ThreadQuery = {
    kind: "issue",
    state: "all",
    sort: "updated",
    direction: "asc",
    perPage: PER_PAGE,
  };
  if (cursor !== null) query.since = new Date(cursor);
  if (!options.full && repo.etag) query.cursor = { etag: repo.etag };

  const first = await provider.threads.list(repoRef, query).page();
  if (first.notModified) {
    mirror.setRepoPolledAt(repo.id, now);
    mirror.setRepoDegraded(repo.id, false);
    return {
      notModified: true,
      changed: 0,
      hydrated: 0,
      pruned: 0,
      conflicts: 0,
      seenNumbers: [],
    };
  }

  // Follow the provider cursor for the remaining pages of the feed.
  const threads: Thread[] = [...first.items];
  let next = first.cursor;
  while (next) {
    const page = await provider.threads.list(repoRef, {
      ...query,
      cursor: next,
    }).page();
    if (page.notModified) break;
    threads.push(...page.items);
    next = page.cursor;
  }

  const cutoff = now - sync.history_days * DAY_MS;
  const seenNumbers: number[] = [];
  const nodeIds: string[] = [];
  const pruned: number[] = [];
  for (const thread of threads) {
    const number = Number(thread.ref.number);
    if (!Number.isInteger(number)) continue;
    const windowed = {
      state: thread.state,
      closedAt: thread.closedAt ? thread.closedAt.getTime() : null,
    };
    if (inHistoryWindow(windowed, cutoff)) {
      seenNumbers.push(number);
      if (typeof thread.ref.externalId === "string") {
        nodeIds.push(thread.ref.externalId);
      }
    } else {
      pruned.push(number);
    }
  }

  const hydrated =
    nodeIds.length > 0
      ? await hydrateAndStore(installationId, repo.id, nodeIds, undefined, {
          vocabulary,
        })
      : [];
  const conflicts = await resolveConflicts(provider, repo, hydrated, vocabulary);

  // Changed issues that aged out of the window are dropped from the mirror.
  for (const number of pruned) mirror.deleteIssue(repo.id, number);

  mirror.setRepoEtag(repo.id, first.etag ?? null);
  mirror.setRepoPolledAt(repo.id, now);
  mirror.setRepoDegraded(repo.id, false);

  if (seenNumbers.length > 0) {
    publish({
      type: "issues",
      repo: `${repo.org}/${repo.name}`,
      numbers: seenNumbers,
    });
  }

  return {
    notModified: false,
    changed: seenNumbers.length,
    hydrated: hydrated.length,
    pruned: pruned.length,
    conflicts,
    seenNumbers,
  };
}

/** Upsert `mirror_repo` from the provider's repo read (FK target). */
export async function ensureRepoMirror(
  owner: string,
  repo: string,
  installationId: number,
): Promise<mirror.RepoRow> {
  const provider = await forge.installationProvider(installationId);
  const info = await provider.repos.get(forge.repoRef(owner, repo));
  const externalId = info.ref.externalId;
  if (typeof externalId !== "string" || externalId.length === 0) {
    throw new Error(`GitHub returned no id for ${owner}/${repo}`);
  }
  return mirror.upsertRepo({
    externalId,
    forge: info.ref.forge,
    instance: info.ref.instance,
    org: info.ref.owner || owner,
    name: info.ref.name || repo,
    url: info.url ?? "",
    archived: info.isArchived,
  });
}

/** Refresh a repo's label set (multi-select filter options). */
export async function refreshRepoLabels(
  installationId: number,
  repo: mirror.RepoRow,
): Promise<void> {
  const provider = await forge.installationProvider(installationId);
  const labels = await listRepoLabels(provider, repo.org, repo.name);
  mirror.replaceRepoLabels(
    repo.id,
    labels.map((l) => ({
      name: l.name,
      color: l.color,
      description: l.description ?? "",
    })),
  );
}

/** A forge-neutral actor as reported by the assignee and milestone reads. */
type DirectoryUser = {
  externalId: string;
  login: string;
  avatarUrl?: string;
  url?: string;
};

function directoryUser(
  user: DirectoryUser,
  repo: mirror.RepoRow,
): mirror.UserRecord | null {
  if (user.externalId.length === 0) return null;
  return {
    id: 0,
    externalId: user.externalId,
    forge: repo.forge,
    instance: repo.instance,
    login: user.login,
    avatarUrl: user.avatarUrl ?? "",
    url: user.url ?? "",
  };
}

/** Refresh a repo's assignable users (Inspector assignee picker, SPEC §9.2). */
export async function refreshRepoAssignees(
  installationId: number,
  repo: mirror.RepoRow,
): Promise<void> {
  const provider = await forge.installationProvider(installationId);
  const users = await listRepoAssignees(provider, repo.org, repo.name);
  const records = users
    .map((user) => directoryUser(user, repo))
    .filter((user): user is mirror.UserRecord => user !== null);
  mirror.replaceRepoAssignees(repo.id, records);
}

/**
 * Refresh a repo's milestone set (read-only cockpit + Inspector picker).
 * Replace-wholesale, like labels and assignees.
 */
export async function refreshRepoMilestones(
  installationId: number,
  repo: mirror.RepoRow,
): Promise<void> {
  const provider = await forge.installationProvider(installationId);
  const milestones = await listRepoMilestones(provider, repo.org, repo.name);
  mirror.replaceRepoMilestones(
    repo.id,
    milestones.map((milestone) => {
      const creator = milestone.creator
        ? directoryUser(milestone.creator, repo)
        : null;
      return {
        number: milestone.number,
        externalId: milestone.externalId,
        title: milestone.title,
        description: milestone.description,
        state: milestone.state,
        dueOn: milestone.dueOn,
        openIssues: milestone.openIssues,
        closedIssues: milestone.closedIssues,
        creator,
        createdAt: milestone.createdAt,
        updatedAt: milestone.updatedAt,
        closedAt: milestone.closedAt,
        url: milestone.url,
      };
    }),
  );
}

/**
 * Resolve a repo by `owner/name` and refresh its milestones. Fire-and-forget
 * helper for the write path (a newly created milestone must appear in the
 * Inspector picker without waiting for the next poll).
 */
export async function refreshRepoMilestonesBySlug(
  owner: string,
  repo: string,
): Promise<void> {
  const installationId = await forge.getInstallationId(owner, repo);
  const repoRow = await ensureRepoMirror(owner, repo, installationId);
  await refreshRepoMilestones(installationId, repoRow);
}

/**
 * Full cycle for one `owner/repo`: resolve the installation, ensure the repo
 * row, refresh the directory lists on the first cycle, then poll. Marks the
 * repo degraded on failure and rethrows so the scheduler can isolate it.
 *
 * Repo metadata and directory lists change rarely, so a hot poll reuses the
 * mirrored row and skips the label/assignee/milestone reads. The first cycle
 * (`last_polled_at` unset, which includes a freshly ensured row) and nightly
 * reconciliation are responsible for refreshing them.
 */
export async function runRepoCycle(
  owner: string,
  repo: string,
): Promise<PollResult> {
  const startedAt = Date.now();
  const repoLabel = `${owner}/${repo}`;
  const ref = forge.repoRef(owner, repo);
  const installationId = await forge.getInstallationId(owner, repo);
  const repoRow =
    mirror.getRepoBySlug(ref.forge, ref.instance, ref.owner, ref.name) ??
    (await ensureRepoMirror(owner, repo, installationId));
  try {
    log.debug({ repo: repoLabel }, "repo poll started");
    if (repoRow.lastPolledAt === null) {
      await Promise.all([
        refreshRepoLabels(installationId, repoRow),
        refreshRepoAssignees(installationId, repoRow),
        refreshRepoMilestones(installationId, repoRow),
      ]);
    }
    const result = await pollRepo(repoRow, installationId, Date.now());
    log.debug(
      { repo: repoLabel, ...result, durationMs: Date.now() - startedAt },
      "repo polled",
    );
    return result;
  } catch (error) {
    mirror.setRepoDegraded(repoRow.id, true);
    log.warn(
      { repo: repoLabel, ...errorFields(error) },
      "repo poll failed",
    );
    throw error;
  }
}

/**
 * Immediate single-issue refresh after a successful Funnel write (SPEC §7.2).
 * Used by the mutation layer (Milestone 5).
 */
export async function refreshIssue(
  owner: string,
  repo: string,
  number: number,
  actorUserId?: string,
): Promise<void> {
  const repoRef = forge.repoRef(owner, repo);
  const installationId = await forge.getInstallationId(owner, repo);
  const repoRow =
    mirror.getRepoBySlug(
      repoRef.forge,
      repoRef.instance,
      repoRef.owner,
      repoRef.name,
    ) ?? (await ensureRepoMirror(owner, repo, installationId));
  const provider = await forge.installationProvider(installationId);
  const thread = await provider.threads.get(
    forge.threadRef(repoRef, "issue", number),
  );
  if (typeof thread.ref.externalId !== "string") return;
  const config = await getConfig();
  const vocabulary = vocabularyFor(config.labels.prefix);
  const records = await hydrateAndStore(
    installationId,
    repoRow.id,
    [thread.ref.externalId],
    undefined,
    { actorUserId, vocabulary },
  );
  await resolveConflicts(provider, repoRow, records, vocabulary);
  publish({ type: "issues", repo: `${owner}/${repo}`, numbers: [number] });
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

let running = false;
let timer: ReturnType<typeof setTimeout> | undefined;
const nextDue = new Map<string, number>();

/** Start the background loop. Idempotent; returns immediately. */
export function startSyncWorker(): void {
  if (running) return;
  running = true;
  log.info({ tickMs: TICK_MS }, "sync worker started");
  void tick();
}

/** Stop the loop (tests / shutdown). */
export function stopSyncWorker(): void {
  running = false;
  if (timer) clearTimeout(timer);
  timer = undefined;
  nextDue.clear();
}

/**
 * Signal that instance settings changed (repos added/removed, intervals
 * retuned). Clears the per-repo schedule so the next tick re-reads config and
 * picks up new repositories; wakes the loop immediately if it is idle.
 */
export function notifyConfigChanged(): void {
  nextDue.clear();
  if (running && !timer) void tick();
}

/** Run one cycle for every configured repo now (tests / manual trigger). */
export async function syncAllRepos(): Promise<void> {
  const startedAt = Date.now();
  let repos: readonly string[];
  try {
    repos = configuredRepoSlugs(await getConfig());
  } catch (error) {
    log.warn(errorFields(error), "sync skipped: no config");
    return;
  }
  log.info({ repos: repos.length }, "sync run started");
  let failed = 0;
  for (const entry of repos) {
    const [owner, repo] = entry.split("/");
    try {
      await runRepoCycle(owner, repo);
    } catch {
      // Already logged and flagged degraded by runRepoCycle.
      failed += 1;
    }
  }
  log.info(
    { repos: repos.length, failed, durationMs: Date.now() - startedAt },
    "sync run finished",
  );
}

async function tick(): Promise<void> {
  if (!running) return;
  const now = Date.now();
  const startedAt = now;
  let polled = 0;
  let failed = 0;
  try {
    const config = await getConfig();
    const { sync } = config;
    const repos = configuredRepoSlugs(config);
    const intervalMs =
      (clientCount() > 0
        ? sync.poll_interval_active_seconds
        : sync.poll_interval_idle_seconds) * 1000;

    log.debug(
      { repos: repos.length, intervalMs },
      "sync tick started",
    );

    // Stagger first-time repos across the interval so they never burst.
    repos.forEach((entry, index) => {
      if (!nextDue.has(entry)) {
        nextDue.set(entry, now + (intervalMs / repos.length) * index);
      }
    });

    for (const entry of repos) {
      if (!running) return;
      if ((nextDue.get(entry) ?? now) > Date.now()) continue;
      const [owner, repo] = entry.split("/");
      try {
        await runRepoCycle(owner, repo);
        polled += 1;
      } catch {
        // Isolated by runRepoCycle; keep polling the remaining repos.
        failed += 1;
      }
      nextDue.set(entry, Date.now() + intervalMs);
    }

    log.debug(
      { repos: repos.length, polled, failed, durationMs: Date.now() - startedAt },
      "sync tick finished",
    );
  } catch (error) {
    log.warn(errorFields(error), "sync tick failed");
  }
  if (running) timer = setTimeout(() => void tick(), TICK_MS);
}
