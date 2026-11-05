/**
 * Pure triage-rule evaluation (issue #37).
 *
 * The four rules share one vocabulary and one breach DTO so the Attention view
 * and the notification planner never disagree about what is due. Nothing here
 * touches SQLite, config or the clock: callers pass already-gathered open
 * issues, waiting rows, thresholds and `now`.
 *
 * Clock semantics, deliberately split:
 *
 *  - first response and stale open use elapsed *instants* (`created_at` /
 *    `updated_at`), so timezone and DST never move their boundary;
 *  - waiting reuses the #32 *local calendar-day* helper because it describes a
 *    wait that began at an instant but is read as calendar days;
 *  - re-check compares the blocked body date with the server's UTC
 *    `YYYY-MM-DD`, while the Attention page's existing blocked grouping stays
 *    browser-local.
 *
 * Every rule treats `0` as disabled. First response and stale open breach at
 * the boundary (`age >= days`); waiting and re-check breach only once they are
 * strictly past their threshold, matching their existing UI meanings.
 */
import {
  ATTENTION_RULES,
  ATTENTION_RULE_LABELS,
  daysBetween,
  isValidISODate,
  type AttentionRule,
} from "#lib/attention";
import { readBlocked } from "#lib/funnel-metadata";
import { waitingDays } from "#lib/waiting";
import type { UserRef } from "#lib/server/issues/types";

export { ATTENTION_RULES, ATTENTION_RULE_LABELS, type AttentionRule };

const DAY_MS = 86_400_000;

/** The configurable thresholds, already resolved from settings. */
export interface AttentionThresholds {
  firstResponseDays: number;
  staleOpenDays: number;
  recheckCadenceDays: number;
  waitingDays: number;
}

/** An open mirrored issue with the child data the rules need. */
export interface RuleIssue {
  /** `owner/name`. */
  repo: string;
  number: number;
  title: string;
  body: string;
  /** Unix ms. */
  createdAt: number;
  updatedAt: number;
  /** The mirror's `blocked` flag (the label is the source of truth). */
  blocked: boolean;
  /** The issue author's forge id, or `null` when unknown. */
  authorExternalId: string | null;
  assignees: UserRef[];
  /** One entry per comment; a null author counts as a response. */
  comments: readonly { authorExternalId: string | null }[];
}

/** One local waiting row; only rows whose issue is in {@link RuleInput.issues} count. */
export interface RuleWaiting {
  repo: string;
  number: number;
  /** Unix ms when the wait began. */
  waitingSince: number;
}

/** Everything the four rules evaluate. */
export interface RuleInput {
  /** Open, still-mirrored issues only. */
  issues: readonly RuleIssue[];
  waiting: readonly RuleWaiting[];
}

/** One rule breach, stable across reads while the issue stays open. */
export interface AttentionBreach {
  /** `${rule}:${repo}#${number}`. */
  id: string;
  rule: AttentionRule;
  /** `owner/name`. */
  repo: string;
  number: number;
  title: string;
  /** Short human description carried into notifications. */
  summary: string;
  /**
   * Whole days past the rule's threshold. Zero means "at the boundary" for
   * first response / stale open; waiting and re-check always report at least 1.
   */
  daysOverdue: number;
  assignees: UserRef[];
}

function issueKey(repo: string, number: number): string {
  return `${repo}\u0000${number}`;
}

function utcDate(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function days(value: number): string {
  return value === 1 ? "day" : "days";
}

/**
 * Whether anyone other than the author has commented. A null author on either
 * side counts as a response: Funnel cannot prove the comment came from the
 * author, and a missing issue author means any comment is evidence of a reply.
 */
function hasResponse(issue: RuleIssue): boolean {
  return issue.comments.some(
    (comment) =>
      issue.authorExternalId === null ||
      comment.authorExternalId === null ||
      comment.authorExternalId !== issue.authorExternalId,
  );
}

function breach(
  rule: AttentionRule,
  issue: RuleIssue,
  summary: string,
  daysOverdue: number,
): AttentionBreach {
  return {
    id: `${rule}:${issue.repo}#${issue.number}`,
    rule,
    repo: issue.repo,
    number: issue.number,
    title: issue.title,
    summary,
    daysOverdue,
    assignees: issue.assignees,
  };
}

/**
 * Evaluate every enabled rule. A disabled rule (`0`) contributes nothing, and
 * a waiting row whose issue is closed or no longer mirrored is ignored.
 * Results are deterministic: rule declaration order, then most overdue first,
 * then repo and issue number.
 */
export function evaluateAttentionRules(
  input: RuleInput,
  thresholds: AttentionThresholds,
  now = Date.now(),
): AttentionBreach[] {
  const breaches: AttentionBreach[] = [];
  const openIssues = new Map(
    input.issues.map((issue) => [issueKey(issue.repo, issue.number), issue]),
  );

  for (const issue of input.issues) {
    if (thresholds.firstResponseDays > 0 && !hasResponse(issue)) {
      const ageDays = Math.floor((now - issue.createdAt) / DAY_MS);
      if (now - issue.createdAt >= thresholds.firstResponseDays * DAY_MS) {
        breaches.push(
          breach(
            "first_response",
            issue,
            `No response from anyone other than the author after ${ageDays} ${days(ageDays)} (SLA ${thresholds.firstResponseDays} days)`,
            ageDays - thresholds.firstResponseDays,
          ),
        );
      }
    }

    if (
      thresholds.staleOpenDays > 0 &&
      now - issue.updatedAt >= thresholds.staleOpenDays * DAY_MS
    ) {
      const ageDays = Math.floor((now - issue.updatedAt) / DAY_MS);
      breaches.push(
        breach(
          "stale_open",
          issue,
          `No update for ${ageDays} ${days(ageDays)} (threshold ${thresholds.staleOpenDays} days)`,
          ageDays - thresholds.staleOpenDays,
        ),
      );
    }
  }

  if (thresholds.waitingDays > 0) {
    for (const wait of input.waiting) {
      const issue = openIssues.get(issueKey(wait.repo, wait.number));
      if (!issue) continue;
      const waited = waitingDays(wait, now);
      if (waited > thresholds.waitingDays) {
        breaches.push(
          breach(
            "waiting",
            issue,
            `Waiting ${waited} ${days(waited)} (threshold ${thresholds.waitingDays} days)`,
            waited - thresholds.waitingDays,
          ),
        );
      }
    }
  }

  if (thresholds.recheckCadenceDays > 0) {
    const today = utcDate(now);
    for (const issue of input.issues) {
      if (!issue.blocked) continue;
      const recheck = readBlocked(issue.body).info?.recheck ?? "";
      if (!isValidISODate(recheck)) continue;
      const overdue = daysBetween(recheck, today);
      if (overdue > thresholds.recheckCadenceDays) {
        breaches.push(
          breach(
            "recheck",
            issue,
            `Re-check was due ${overdue} ${days(overdue)} ago (threshold ${thresholds.recheckCadenceDays} days)`,
            overdue - thresholds.recheckCadenceDays,
          ),
        );
      }
    }
  }

  const ruleRank = new Map(
    ATTENTION_RULES.map((rule, index) => [rule, index] as const),
  );
  return breaches.sort(
    (a, b) =>
      (ruleRank.get(a.rule) ?? 0) - (ruleRank.get(b.rule) ?? 0) ||
      b.daysOverdue - a.daysOverdue ||
      a.repo.localeCompare(b.repo) ||
      a.number - b.number,
  );
}
