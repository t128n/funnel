/**
 * Shared notification data types (T1/T2/T4).
 *
 * A notification is stored as a draft first and only becomes an item once the
 * store has assigned it an id. Drafts carry the event key used to de-duplicate
 * repeated polling or post-write refreshes.
 */

export type NotificationKind =
	| 'assigned'
	| 'mentioned'
	| 'comment'
	| 'status'
	| 'priority'
	| 'state'
	| 'new_intake'
	| 'sla';

/** A recipient resolved from the GitHub mirror and the linked Funnel user. */
export interface Recipient {
	userId: string;
	externalId: string;
	login: string;
	avatarUrl: string;
}

/** A comment as captured in an issue snapshot. */
export interface IssueCommentSnapshot {
	externalId: string;
	body: string;
	authorLogin?: string;
	authorAvatarUrl?: string;
}

/** The fields the planner compares between two syncs of the same issue. */
export interface IssueSnapshot {
	status: string;
	priority: string;
	state: string;
	updatedAt: number;
	assigneeIds: string[];
	comments: IssueCommentSnapshot[];
	title?: string;
	number?: number;
	actorLogin?: string;
	actorAvatarUrl?: string;
}

/** One pending notification, before the store assigns it an id. */
export interface NotificationDraft {
	userId: string;
	kind: NotificationKind;
	dedupeKey: string;
	createdAt: number;
	url?: string;
	title?: string;
	body?: string;
	actorLogin?: string | null;
	actorAvatarUrl?: string | null;
}

/** A stored notification as returned to a signed-in user. */
export interface NotificationItem {
	id: string;
	kind: NotificationKind;
	url: string;
	readAt: number | null;
	createdAt: number;
	title?: string;
	body?: string;
	actorLogin?: string | null;
	actorAvatarUrl?: string | null;
}

export interface NotificationQuery {
	limit?: number;
	unreadOnly?: boolean;
	after?: number;
}

export interface IntakeRef {
	id: string;
	title: string;
}

export interface PlanIssueInput {
	previous: IssueSnapshot | null;
	next: IssueSnapshot;
	repo: string;
	watchers: Recipient[];
	recipients: Recipient[];
	actor: Recipient | null;
	now: number;
}
