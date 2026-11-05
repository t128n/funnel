/**
 * Attention-rule notifications (issue #37).
 *
 * The planner is pure: it receives rule breaches and a map of forge external
 * ids to linked Funnel users, then emits one draft per breached issue, rule and
 * assignee per UTC day. The service wrapper resolves the assignees through the
 * notification service and writes the drafts, so tests can exercise the key
 * and cadence without a database.
 *
 * A breach has no actor, so there is no self-notification exception. An
 * assignee with no linked Funnel account is skipped rather than notified
 * somewhere else.
 */
import { ATTENTION_RULE_LABELS } from "#lib/attention";
import type { AttentionBreach } from "#lib/server/attention/rules";
import {
  createNotifications,
  getRecipientsByExternalIds,
} from "./service";
import type { NotificationDraft, Recipient } from "./types";

/** UTC `YYYY-MM-DD` used as the one-notice-per-day bucket. */
export function utcNotificationDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** One draft per (breach, assignee) for the UTC day containing `now`. */
export function planAttentionNotifications(
  breaches: readonly AttentionBreach[],
  recipients: ReadonlyMap<string, Recipient>,
  now = Date.now(),
): NotificationDraft[] {
  const day = utcNotificationDay(now);
  const drafts: NotificationDraft[] = [];
  const seen = new Set<string>();

  for (const breach of breaches) {
    for (const assignee of breach.assignees) {
      const recipient = recipients.get(assignee.externalId);
      if (!recipient) continue;

      const dedupeKey = `sla:${breach.rule}:${breach.repo}#${breach.number}:${recipient.userId}:${day}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      drafts.push({
        userId: recipient.userId,
        kind: "sla",
        dedupeKey,
        createdAt: now,
        url: `/issues/${breach.repo}/${breach.number}`,
        title: `${ATTENTION_RULE_LABELS[breach.rule]}: ${breach.repo}#${breach.number}`,
        body: breach.summary,
      });
    }
  }

  return drafts;
}

/**
 * Resolve every assignee named by the breaches and persist the drafts. Returns
 * the number of rows actually inserted; unresolved assignees and same-day
 * duplicates contribute nothing. Callers gate this on
 * `notifications.enabled` (the sync scheduler does).
 */
export function notifyAttentionBreaches(
  breaches: readonly AttentionBreach[],
  now = Date.now(),
): number {
  if (breaches.length === 0) return 0;
  const externalIds = breaches.flatMap((breach) =>
    breach.assignees.map((assignee) => assignee.externalId),
  );
  const recipients = getRecipientsByExternalIds(externalIds);
  const drafts = planAttentionNotifications(breaches, recipients, now);
  return createNotifications(drafts);
}
