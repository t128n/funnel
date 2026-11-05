/**
 * Read-only loader for the Insights view (issue #36).
 *
 * This module is the only part of Insights that touches SQLite. It gathers the
 * narrow rows the pure arithmetic needs, applies the repo scope, and delegates
 * every definition to `./metrics` so the formulas stay testable without a
 * database.
 */
import { and, eq, gt, gte, inArray, isNull, lt, sql, type SQL } from "drizzle-orm";
import { configuredRepoSlugs, getConfig } from "#lib/server/config";
import { db } from "#lib/server/db/index";
import {
  mirrorRepo,
  mirrorThread,
  stateIntakeSubmission,
  stateIssueWaiting,
  stateTriageEvent,
} from "#lib/server/db/schema";
import { submissionSnoozeClause } from "#lib/server/snooze";
import {
  DECISION_ACTIONS,
  computeInsights,
  emptyInsights,
  resolveDateRange,
  type ClosedIssueRow,
  type InsightsMetrics,
  type MetricsInput,
  type OpenIssueRow,
  type SubmissionRow,
  type TriageEventRow,
  type WaitingRow,
} from "./metrics";

export interface LoadInsightsOptions {
  /** `owner/name`; an unknown repo returns empty metrics, not an error. */
  repo?: string | null;
  /** Requested `YYYY-MM-DD` bounds; invalid pairs fall back to the default. */
  from?: string | null;
  to?: string | null;
  /** Fixed clock for tests. */
  now?: number;
}

/** `owner/name` for a mirrored repository row. */
function repoSlug(): SQL<string> {
  return sql<string>`${mirrorRepo.org} || '/' || ${mirrorRepo.name}`;
}

/** Load the narrow rows and compute one Insights payload. */
export async function loadInsights(
  options: LoadInsightsOptions = {},
): Promise<InsightsMetrics> {
  const now = options.now ?? Date.now();
  const range = resolveDateRange(options.from, options.to, now);
  const repo = options.repo?.trim() || null;

  const config = await getConfig();
  const configured = configuredRepoSlugs(config);
  if (repo !== null && !configured.includes(repo)) {
    return emptyInsights(range, now, repo);
  }

  const repoWhere = repo === null ? undefined : eq(repoSlug(), repo);
  const waitingRepoWhere =
    repo === null ? undefined : eq(stateIssueWaiting.repo, repo);

  const pendingSubmissions = db
    .select({ createdAt: stateIntakeSubmission.createdAt })
    .from(stateIntakeSubmission)
    .where(
      and(
        isNull(stateIntakeSubmission.archivedAt),
        submissionSnoozeClause(now),
      ),
    )
    .all();

  const submissions: SubmissionRow[] = db
    .select({
      id: stateIntakeSubmission.id,
      createdAt: stateIntakeSubmission.createdAt,
    })
    .from(stateIntakeSubmission)
    .all();

  const decisions: TriageEventRow[] = db
    .select({
      submissionId: stateTriageEvent.submissionId,
      action: stateTriageEvent.action,
      repo: stateTriageEvent.repo,
      createdAt: stateTriageEvent.createdAt,
    })
    .from(stateTriageEvent)
    .where(inArray(stateTriageEvent.action, [...DECISION_ACTIONS]))
    .all();

  const closedIssues: ClosedIssueRow[] = db
    .select({
      createdAt: mirrorThread.createdAt,
      closedAt: mirrorThread.closedAt,
    })
    .from(mirrorThread)
    .innerJoin(mirrorRepo, eq(mirrorThread.repoId, mirrorRepo.id))
    .where(
      and(
        eq(mirrorThread.kind, "issue"),
        gt(mirrorThread.createdAt, 0),
        gte(mirrorThread.closedAt, range.start),
        lt(mirrorThread.closedAt, range.end),
        repoWhere,
      ),
    )
    .all();

  const openIssues: OpenIssueRow[] = db
    .select({
      repo: repoSlug(),
      number: mirrorThread.number,
      status: mirrorThread.status,
      createdAt: mirrorThread.createdAt,
    })
    .from(mirrorThread)
    .innerJoin(mirrorRepo, eq(mirrorThread.repoId, mirrorRepo.id))
    .where(
      and(
        eq(mirrorThread.kind, "issue"),
        eq(mirrorThread.state, "open"),
        repoWhere,
      ),
    )
    .all();

  const waiting: WaitingRow[] = db
    .select({
      repo: stateIssueWaiting.repo,
      number: stateIssueWaiting.number,
      waitingSince: stateIssueWaiting.waitingSince,
    })
    .from(stateIssueWaiting)
    .where(waitingRepoWhere)
    .all();

  const input: MetricsInput = {
    pendingSubmissions,
    submissions,
    decisions,
    closedIssues,
    openIssues,
    waiting,
  };
  return computeInsights(
    input,
    range,
    now,
    repo,
    config.attention.waiting_days,
  );
}
