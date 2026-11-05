/**
 * Read-only attention-rule data access (issue #37).
 *
 * Gathers the rows the pure {@link evaluateAttentionRules} evaluator needs in a
 * fixed number of queries: open issues (with a SQL-computed response flag),
 * their assignees and local waiting rows. Nothing is per-issue, so a large
 * backlog cannot turn this into N+1 reads.
 *
 * Only open, still-mirrored issues are selected. A waiting row for a closed or
 * pruned issue is passed through anyway; the evaluator drops it when it cannot
 * find the matching open issue.
 */
import { and, eq, sql } from "drizzle-orm";
import { getConfig } from "#lib/server/config";
import { db } from "#lib/server/db/index";
import {
  mirrorComment,
  mirrorRepo,
  mirrorThread,
  mirrorThreadAssignee,
  mirrorUser,
} from "#lib/server/db/schema";
import { listWaiting } from "#lib/server/waiting";
import type { UserRef } from "#lib/server/issues/types";
import {
  evaluateAttentionRules,
  type AttentionBreach,
  type RuleIssue,
  type RuleWaiting,
} from "./rules";

export type { AttentionBreach } from "./rules";

function issueKey(repo: string, number: number): string {
  return `${repo}\u0000${number}`;
}

function userRef(row: {
  externalId: string;
  forge: string;
  instance: string;
  login: string;
  avatarUrl: string;
}): UserRef {
  return {
    externalId: row.externalId,
    forge: row.forge,
    instance: row.instance,
    login: row.login,
    avatarUrl: row.avatarUrl,
  };
}

/** All rule breaches for the current config, empty data or no rules included. */
export async function attentionBreaches(
  now = Date.now(),
): Promise<AttentionBreach[]> {
  const config = await getConfig();
  const thresholds = {
    firstResponseDays: config.attention.first_response_days,
    staleOpenDays: config.attention.stale_open_days,
    recheckCadenceDays: config.attention.recheck_cadence_days,
    waitingDays: config.attention.waiting_days,
  };

  if (
    thresholds.firstResponseDays === 0 &&
    thresholds.staleOpenDays === 0 &&
    thresholds.recheckCadenceDays === 0 &&
    thresholds.waitingDays === 0
  ) {
    return [];
  }

  const rows = db
    .select({
      repoId: mirrorThread.repoId,
      org: mirrorRepo.org,
      name: mirrorRepo.name,
      number: mirrorThread.number,
      title: mirrorThread.title,
      body: mirrorThread.body,
      createdAt: mirrorThread.createdAt,
      updatedAt: mirrorThread.updatedAt,
      blocked: mirrorThread.blocked,
      hasResponse: sql<number>`EXISTS (
        SELECT 1 FROM ${mirrorComment} c
        WHERE c.repo_id = ${mirrorThread.repoId}
          AND c.thread_number = ${mirrorThread.number}
          AND (
            ${mirrorThread.authorId} IS NULL
            OR c.author_id IS NULL
            OR c.author_id <> ${mirrorThread.authorId}
          )
      )`,
    })
    .from(mirrorThread)
    .innerJoin(mirrorRepo, eq(mirrorThread.repoId, mirrorRepo.id))
    .where(
      and(eq(mirrorThread.kind, "issue"), eq(mirrorThread.state, "open")),
    )
    .all();

  if (rows.length === 0) return [];

  const assigneeRows = db
    .select({
      repoId: mirrorThreadAssignee.repoId,
      number: mirrorThreadAssignee.threadNumber,
      externalId: mirrorUser.externalId,
      forge: mirrorUser.forge,
      instance: mirrorUser.instance,
      login: mirrorUser.login,
      avatarUrl: mirrorUser.avatarUrl,
    })
    .from(mirrorThreadAssignee)
    .innerJoin(mirrorUser, eq(mirrorThreadAssignee.userId, mirrorUser.id))
    .innerJoin(
      mirrorThread,
      and(
        eq(mirrorThread.repoId, mirrorThreadAssignee.repoId),
        eq(mirrorThread.number, mirrorThreadAssignee.threadNumber),
      ),
    )
    .where(
      and(eq(mirrorThread.kind, "issue"), eq(mirrorThread.state, "open")),
    )
    .all();

  const assignees = new Map<string, UserRef[]>();
  for (const row of assigneeRows) {
    const key = issueKey(`${row.repoId}`, row.number);
    const list = assignees.get(key) ?? [];
    list.push(userRef(row));
    assignees.set(key, list);
  }

  const issues: RuleIssue[] = rows.map((row) => {
    const key = issueKey(`${row.repoId}`, row.number);
    return {
      repo: `${row.org}/${row.name}`,
      number: row.number,
      title: row.title,
      body: row.body,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      blocked: row.blocked === 1,
      hasResponse: row.hasResponse === 1,
      assignees: assignees.get(key) ?? [],
    };
  });

  const waiting: RuleWaiting[] = listWaiting(now).map((row) => ({
    repo: row.repo,
    number: row.number,
    waitingSince: row.waitingSince,
  }));

  return evaluateAttentionRules({ issues, waiting }, thresholds, now);
}
