/**
 * Nightly reconciliation (SPEC §7.2).
 *
 * Once a day Funnel does a full, unconditional sweep per repo (no `since`) to:
 *  - re-hydrate every open issue and every issue closed within the history
 *    window, catching anything incremental polling missed;
 *  - prune mirror rows whose issue was deleted or transferred away (absent from
 *    the full listing) or has aged out of the window;
 *  - re-run self-healing canonical label provisioning (SPEC §5.2.4).
 *
 * Scheduled for 03:00 local time and re-armed after each run.
 */
import { configuredRepoSlugs, getConfig } from "#/lib/server/config";
import { createLogger, errorFields } from "#/lib/server/log";
import { forge } from "#/lib/server/forge/providers.server";
import { vocabularyFor } from "#/lib/server/label-vocabulary";
import {
  provisionRepoLabels,
  type ProvisionSummary,
} from "#/lib/server/github/labels";
import * as mirror from "./mirror";
import {
  ensureRepoMirror,
  pollRepo,
  refreshRepoAssignees,
  refreshRepoLabels,
  refreshRepoMilestones,
} from "./worker";

const log = createLogger({ component: "reconcile" });

/** Local hour (0-23) the nightly sweep runs. */
export const RECONCILE_HOUR = 3;

export interface ReconcileResult {
  repo: string;
  changed: number;
  hydrated: number;
  /** Mirror rows removed (aged out, deleted, or transferred). */
  pruned: number;
  labels: ProvisionSummary | null;
  error?: string;
}

export interface ReconcileReport {
  repos: ReconcileResult[];
  pruned: number;
  failed: number;
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? (error as { status?: unknown }).status
      : undefined;
  return typeof status === "number" ? `${status} ${message}`.trim() : message;
}

/** Full sweep of one repo: unconditional poll, prune, re-provision labels. */
export async function reconcileRepo(
  owner: string,
  repo: string,
): Promise<ReconcileResult> {
  const installationId = await forge.getInstallationId(owner, repo);
  const repoRow = await ensureRepoMirror(owner, repo, installationId);

  // `full` ignores the cursor and lists every issue (open + closed in window).
  const result = await pollRepo(repoRow, installationId, Date.now(), {
    full: true,
  });
  // Refresh the repo directory lists so closed/renamed milestones, label
  // options and the assignee picker all converge during the nightly sweep.
  await Promise.all([
    refreshRepoLabels(installationId, repoRow),
    refreshRepoAssignees(installationId, repoRow),
    refreshRepoMilestones(installationId, repoRow),
  ]);
  const removed = mirror.deleteIssuesNotIn(repoRow.id, result.seenNumbers);
  const { labels } = await getConfig();
  const summary = await provisionRepoLabels(
    owner,
    repo,
    vocabularyFor(labels.prefix).labels,
  );
  mirror.setRepoReconciledAt(repoRow.id, Date.now());
  mirror.setRepoDegraded(repoRow.id, false);

  return {
    repo: `${owner}/${repo}`,
    changed: result.changed,
    hydrated: result.hydrated,
    pruned: result.pruned + removed,
    labels: summary,
  };
}

/** Sweep every configured repo, isolating failures. */
export async function runReconciliation(): Promise<ReconcileReport> {
  const report: ReconcileReport = { repos: [], pruned: 0, failed: 0 };

  let repos: readonly string[];
  try {
    repos = configuredRepoSlugs(await getConfig());
  } catch (error) {
    log.warn(errorFields(error), "reconciliation skipped");
    return report;
  }

  const startedAt = Date.now();
  log.info({ repos: repos.length }, "reconciliation started");
  for (const entry of repos) {
    const slash = entry.indexOf("/");
    const owner = entry.slice(0, slash);
    const repo = entry.slice(slash + 1);
    const repoStartedAt = Date.now();
    try {
      const result = await reconcileRepo(owner, repo);
      report.pruned += result.pruned;
      report.repos.push(result);
      log.info(
        {
          repo: entry,
          changed: result.changed,
          hydrated: result.hydrated,
          pruned: result.pruned,
          labelsCreated: result.labels?.created.length ?? 0,
          durationMs: Date.now() - repoStartedAt,
        },
        "repo reconciled",
      );
    } catch (error) {
      report.failed += 1;
      const message = errorMessage(error);
      report.repos.push({
        repo: entry,
        changed: 0,
        hydrated: 0,
        pruned: 0,
        labels: null,
        error: message,
      });
      log.warn(
        { repo: entry, ...errorFields(error) },
        "reconciliation failed",
      );
    }
  }
  log.info(
    {
      repos: report.repos.length,
      pruned: report.pruned,
      failed: report.failed,
      durationMs: Date.now() - startedAt,
    },
    "reconciliation finished",
  );
  return report;
}

/** Milliseconds until the next local `RECONCILE_HOUR:00`. */
export function msUntilNextRun(now = new Date()): number {
  const next = new Date(now);
  next.setHours(RECONCILE_HOUR, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

/** Arm the daily timer; re-arms itself after each run. */
export function scheduleReconciliation(): void {
  const delay = msUntilNextRun();
  setTimeout(async () => {
    try {
      await runReconciliation();
    } catch (error) {
      log.warn(errorFields(error), "reconciliation run failed");
    }
    scheduleReconciliation();
  }, delay);
  log.info(
    { nextRunInMs: delay, hour: RECONCILE_HOUR },
    "reconciliation scheduled",
  );
}
