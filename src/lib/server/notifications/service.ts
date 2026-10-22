/**
 * Notification store (T1).
 *
 * Persists per-user notifications and issue watches, resolves GitHub people to
 * linked Funnel accounts through the disposable mirror, and broadcasts a
 * payload-free `notifications` refresh signal after a row lands. Reads are
 * always scoped by `auth_user.id`; nothing here trusts a caller-supplied
 * "current user" beyond the id it is given.
 */

import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import {
	authAccount,
	authUser,
	mirrorUser,
	stateIssueWatch,
	stateNotification,
} from "#lib/server/db/schema";
import { publish } from "#lib/server/sync/events";
import type {
	IntakeRef,
	NotificationDraft,
	NotificationItem,
	NotificationKind,
	NotificationQuery,
	Recipient
} from "./types";

const DEFAULT_LIMIT = 50;

const githubAccountMatch = sql`cast(${authAccount.accountId} as integer) = ${mirrorUser.externalId}`;

function recipientColumns() {
	return {
		userId: authAccount.userId,
		externalId: mirrorUser.externalId,
		login: mirrorUser.login,
		avatarUrl: mirrorUser.avatarUrl,
	};
}

/**
 * Insert drafts, skipping any whose `dedupe_key` already exists. Returns how
 * many rows actually landed and publishes a single refresh signal when at
 * least one did.
 */
export function createNotifications(drafts: readonly NotificationDraft[]): number {
	if (drafts.length === 0) return 0;

	const inserted = db
		.insert(stateNotification)
		.values(
			drafts.map((draft) => ({
				id: crypto.randomUUID(),
				userId: draft.userId,
				kind: draft.kind,
				dedupeKey: draft.dedupeKey,
				title: draft.title ?? "",
				body: draft.body ?? "",
				url: draft.url ?? "",
				actorLogin: draft.actorLogin ?? null,
				actorAvatarUrl: draft.actorAvatarUrl ?? null,
				createdAt: draft.createdAt,
				readAt: null,
			})),
		)
		.onConflictDoNothing({ target: stateNotification.dedupeKey })
		.returning({ id: stateNotification.id })
		.all();

	if (inserted.length > 0) publish({ type: "notifications" });
	return inserted.length;
}

/** Newest first, scoped to the user, with optional unread/after/limit filters. */
export function listNotifications(
	userId: string,
	opts: NotificationQuery = {},
): NotificationItem[] {
	const filters = [eq(stateNotification.userId, userId)];
	if (opts.unreadOnly) filters.push(isNull(stateNotification.readAt));
	if (opts.after !== undefined) {
		filters.push(gt(stateNotification.createdAt, opts.after));
	}

	const limit =
		opts.limit !== undefined && opts.limit > 0 ? opts.limit : DEFAULT_LIMIT;

	return db
		.select({
			id: stateNotification.id,
			kind: stateNotification.kind,
			url: stateNotification.url,
			title: stateNotification.title,
			body: stateNotification.body,
			actorLogin: stateNotification.actorLogin,
			actorAvatarUrl: stateNotification.actorAvatarUrl,
			readAt: stateNotification.readAt,
			createdAt: stateNotification.createdAt,
		})
		.from(stateNotification)
		.where(and(...filters))
		.orderBy(desc(stateNotification.createdAt), desc(stateNotification.id))
		.limit(limit)
		.all()
		.map((row) => ({ ...row, kind: row.kind as NotificationKind }));
}

export function unreadNotificationCount(userId: string): number {
	return db
		.select({ id: stateNotification.id })
		.from(stateNotification)
		.where(
			and(
				eq(stateNotification.userId, userId),
				isNull(stateNotification.readAt),
			),
		)
		.all().length;
}

/** Mark one row read. Returns whether the row belongs to the user. */
export function markNotificationRead(userId: string, id: string): boolean {
	return (
		db
			.update(stateNotification)
			.set({ readAt: Date.now() })
			.where(
				and(
					eq(stateNotification.userId, userId),
					eq(stateNotification.id, id),
				),
			)
			.returning({ id: stateNotification.id })
			.all().length > 0
	);
}

/** Mark every unread row owned by the user. Returns the number changed. */
export function markAllNotificationsRead(userId: string): number {
	return db
		.update(stateNotification)
		.set({ readAt: Date.now() })
		.where(
			and(
				eq(stateNotification.userId, userId),
				isNull(stateNotification.readAt),
			),
		)
		.returning({ id: stateNotification.id })
		.all().length;
}

export function watchIssue(
	userId: string,
	org: string,
	name: string,
	issueNumber: number,
): void {
	db.insert(stateIssueWatch)
		.values({ userId, org, name, issueNumber, createdAt: Date.now() })
		.onConflictDoNothing()
		.run();
}

export function unwatchIssue(
	userId: string,
	org: string,
	name: string,
	issueNumber: number,
): void {
	db.delete(stateIssueWatch)
		.where(
			and(
				eq(stateIssueWatch.userId, userId),
				eq(stateIssueWatch.org, org),
				eq(stateIssueWatch.name, name),
				eq(stateIssueWatch.issueNumber, issueNumber),
			),
		)
		.run();
}

export function isWatching(
	userId: string,
	org: string,
	name: string,
	issueNumber: number,
): boolean {
	return (
		db
			.select({ userId: stateIssueWatch.userId })
			.from(stateIssueWatch)
			.where(
				and(
					eq(stateIssueWatch.userId, userId),
					eq(stateIssueWatch.org, org),
					eq(stateIssueWatch.name, name),
					eq(stateIssueWatch.issueNumber, issueNumber),
				),
			)
			.limit(1)
			.all().length > 0
	);
}

/**
 * Watchers with a linked Funnel account. Watches for people without a
 * `providerId = "github"` account are ignored: they cannot receive a private
 * notification.
 */
export function listWatchers(
	org: string,
	name: string,
	issueNumber: number,
): Recipient[] {
	return db
		.select(recipientColumns())
		.from(stateIssueWatch)
		.innerJoin(authAccount, eq(authAccount.userId, stateIssueWatch.userId))
		.innerJoin(
			mirrorUser,
			and(eq(authAccount.providerId, "github"), githubAccountMatch),
		)
		.where(
			and(
				eq(stateIssueWatch.org, org),
				eq(stateIssueWatch.name, name),
				eq(stateIssueWatch.issueNumber, issueNumber),
			),
		)
		.orderBy(asc(stateIssueWatch.userId))
		.all();
}

/** Resolve one mirrored GitHub person to a linked Funnel user. */
export function getRecipientByExternalId(externalId: string): Recipient | null {
	return (
		db
			.select(recipientColumns())
			.from(mirrorUser)
			.innerJoin(
				authAccount,
				and(eq(authAccount.providerId, "github"), githubAccountMatch),
			)
			.where(eq(mirrorUser.externalId, externalId))
			.limit(1)
			.all()[0] ?? null
	);
}

/** Resolve a GitHub login to a linked Funnel user. */
export function getRecipientByLogin(login: string): Recipient | null {
	return (
		db
			.select(recipientColumns())
			.from(mirrorUser)
			.innerJoin(
				authAccount,
				and(eq(authAccount.providerId, "github"), githubAccountMatch),
			)
			.where(sql`lower(${mirrorUser.login}) = ${login.toLowerCase()}`)
			.limit(1)
			.all()[0] ?? null
	);
}

/** Every linked user with the `admin` role. */
export function listAdminRecipients(): Recipient[] {
	return db
		.select(recipientColumns())
		.from(authUser)
		.innerJoin(authAccount, eq(authAccount.userId, authUser.id))
		.innerJoin(
			mirrorUser,
			and(eq(authAccount.providerId, "github"), githubAccountMatch),
		)
		.where(eq(authUser.role, "admin"))
		.orderBy(asc(authUser.id))
		.all();
}

/**
 * Notify every admin about a new public intake submission. The submission id
 * is part of the dedupe key, so re-running the hook never repeats a notice.
 */
export function notifyNewIntake(submission: IntakeRef): number {
	const now = Date.now();
	const drafts = listAdminRecipients().map((admin) => ({
		userId: admin.userId,
		kind: "new_intake" as const,
		dedupeKey: `new_intake:${submission.id}:${admin.userId}`,
		createdAt: now,
		title: submission.title,
		url: `/inbox/submission/${submission.id}`,
	}));
	return createNotifications(drafts);
}
