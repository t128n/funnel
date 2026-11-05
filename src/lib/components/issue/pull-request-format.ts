import type {
  IssuePullRequestSummary,
  LinkedPullRequest,
} from '#lib/server/issues/types';

/** Human state for a linked PR, including the orthogonal draft flag. */
export function pullRequestStateLabel(
  pr: Pick<LinkedPullRequest, 'state' | 'isDraft'>
): string {
  if (pr.state === 'merged') return 'Merged';
  if (pr.state === 'closed') return 'Closed';
  if (pr.isDraft) return 'Draft';
  if (pr.state === 'open') return 'Open';
  return 'Unknown';
}

/** Badge tone for the same state. */
export function pullRequestStateTone(
  pr: Pick<LinkedPullRequest, 'state' | 'isDraft'>
): string {
  if (pr.state === 'merged') return 'primary';
  if (pr.state === 'closed') return 'secondary';
  if (pr.isDraft) return 'secondary';
  return 'success';
}

/** Review decision as the panel and its accessible label present it. */
export function pullRequestReviewLabel(decision: string | null): string | null {
  switch (decision) {
    case 'approved':
      return 'Approved';
    case 'changes_requested':
      return 'Changes requested';
    case 'review_required':
      return 'Review required';
    case 'pending':
      return 'Review pending';
    default:
      return null;
  }
}

/** Check rollup, including failed and pending counts when GitHub reports them. */
export function pullRequestChecksLabel(
  checks: LinkedPullRequest['checks']
): string | null {
  if (!checks) return null;
  if (checks.state === 'failure') {
    return checks.failed
      ? `Checks failing (${checks.failed} failed)`
      : 'Checks failing';
  }
  if (checks.state === 'pending') return 'Checks pending';
  if (checks.state === 'success') return 'Checks passing';
  if (checks.state === 'unknown') return 'Checks unknown';
  return null;
}

/**
 * One-line summary for the compact row/card indicator. Kept pure so the source
 * contract test can exercise it without a Svelte loader.
 */
export function pullRequestSummaryLabel(
  summary: IssuePullRequestSummary
): string {
  const parts: string[] = [
    `${summary.total} linked pull request${summary.total === 1 ? '' : 's'}`,
  ];
  if (summary.open > 0) parts.push(`${summary.open} open`);
  if (summary.merged > 0) parts.push(`${summary.merged} merged`);
  if (summary.closed > 0) parts.push(`${summary.closed} closed`);
  const checks =
    summary.checksState === 'failure'
      ? summary.checksFailed > 0
        ? `checks failing (${summary.checksFailed} failed)`
        : 'checks failing'
      : summary.checksState === 'pending'
        ? 'checks pending'
        : summary.checksState === 'success'
          ? 'checks passing'
          : summary.checksState === 'unknown'
            ? 'checks unknown'
            : null;
  if (checks) parts.push(checks);
  return parts.join(' · ');
}

/** Bootstrap icon for the compact indicator, coloured by the worst check. */
export function pullRequestSummaryIcon(
  summary: IssuePullRequestSummary
): string {
  if (summary.checksState === 'failure') {
    return 'bi-x-circle-fill text-danger';
  }
  if (summary.checksState === 'pending') {
    return 'bi-clock-fill text-warning';
  }
  if (summary.checksState === 'success') {
    return 'bi-check-circle-fill text-success';
  }
  return summary.open > 0 ? 'bi-git text-success' : 'bi-git text-body-secondary';
}
