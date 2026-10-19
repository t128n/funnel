/**
 * Pure notification rule planner (T2).
 *
 * Compares two snapshots of the same mirrored issue and produces the drafts
 * the store should insert. It never reads config, the database or the network;
 * every recipient and the actor are resolved by the caller.
 */

import type {
	NotificationDraft,
	NotificationKind,
	PlanIssueInput,
	Recipient
} from './types';

const EXCERPT_LENGTH = 140;

/**
 * Extract `@login` mentions from a comment body. Matching is case-insensitive
 * and honours GitHub's login alphabet (`a-z`, `0-9`, `-`). Duplicates are
 * removed while order is preserved.
 */
export function parseMentions(body: string): string[] {
	const pattern = /(?<![a-z0-9])@([a-z0-9-]+)/gi;
	const logins: string[] = [];
	for (const match of body.matchAll(pattern)) {
		const login = match[1].toLowerCase();
		if (!logins.includes(login)) logins.push(login);
	}
	return logins;
}

function excerpt(body: string): string {
	return body
		.replace(/<!--[\s\S]*?-->/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, EXCERPT_LENGTH)
		.trimEnd();
}

function uniqueRecipients(...groups: readonly Recipient[][]): Recipient[] {
	const seen = new Set<string>();
	const result: Recipient[] = [];
	for (const group of groups) {
		for (const recipient of group) {
			if (seen.has(recipient.userId)) continue;
			seen.add(recipient.userId);
			result.push(recipient);
		}
	}
	return result;
}

/** Watchers and candidates are matched to mentions by their GitHub login. */
function sameLogin(recipient: Recipient, login: string | undefined): boolean {
	return login !== undefined && recipient.login.toLowerCase() === login.toLowerCase();
}

export function planIssueNotifications(input: PlanIssueInput): NotificationDraft[] {
	const { previous, next, repo, watchers, recipients, actor, now } = input;

	// First sight of an issue is silent: only a change from an already-known
	// snapshot can produce notifications.
	if (!previous) return [];

	const number = next.number ?? previous.number ?? 0;
	const title = next.title ?? previous.title;
	const issue = `${repo}#${number}`;
	const url = `/issues/${repo}/${number}`;
	const actorLogin = actor?.login ?? next.actorLogin ?? previous.actorLogin;
	const actorAvatarUrl = actor?.avatarUrl ?? next.actorAvatarUrl ?? previous.actorAvatarUrl;

	const drafts: NotificationDraft[] = [];
	const seen = new Set<string>();

	function isActor(recipient: Recipient): boolean {
		return actor !== null && actor.githubId === recipient.githubId;
	}

	function add(
		recipient: Recipient,
		kind: NotificationKind,
		eventKey: string,
		body?: string
	): boolean {
		if (isActor(recipient)) return false;

		const dedupeKey = `${kind}:${issue}:${recipient.userId}:${eventKey}`;
		if (seen.has(dedupeKey)) return false;
		seen.add(dedupeKey);

		const draft: NotificationDraft = {
			userId: recipient.userId,
			kind,
			dedupeKey,
			createdAt: now,
			url
		};
		if (title !== undefined) draft.title = title;
		if (body) draft.body = body;
		if (actorLogin !== undefined) draft.actorLogin = actorLogin;
		if (actorAvatarUrl !== undefined) draft.actorAvatarUrl = actorAvatarUrl;

		drafts.push(draft);
		return true;
	}

	// New assignees get an assignment notice, even without watching.
	const previousAssignees = new Set(previous.assigneeIds);
	for (const recipient of uniqueRecipients(recipients)) {
		if (
			next.assigneeIds.includes(recipient.githubId) &&
			!previousAssignees.has(recipient.githubId)
		) {
			add(recipient, 'assigned', String(now));
		}
	}

	// Comments are new when their GitHub id was not in the previous snapshot.
	const previousComments = new Set(previous.comments.map((comment) => comment.githubId));
	const newComments = next.comments.filter(
		(comment) => !previousComments.has(comment.githubId)
	);
	if (newComments.length > 0) {
		const candidates = uniqueRecipients(recipients, watchers);

		for (const comment of newComments) {
			const body = excerpt(comment.body);
			const mentions = new Set(parseMentions(comment.body));
			const mentioned = new Set<string>();

			// A mention wins over the plain watched-comment notice for the same
			// person and comment.
			for (const recipient of candidates) {
				if (!mentions.has(recipient.login.toLowerCase())) continue;
				if (sameLogin(recipient, comment.authorLogin)) continue;
				if (add(recipient, 'mentioned', String(comment.githubId), body)) {
					mentioned.add(recipient.userId);
				}
			}

			for (const watcher of watchers) {
				if (mentioned.has(watcher.userId)) continue;
				// Never tell someone about the comment they wrote themselves.
				if (sameLogin(watcher, comment.authorLogin)) continue;
				add(watcher, 'comment', String(comment.githubId), body);
			}
		}
	}

	// Watchers hear about triage and state changes.
	const changes: Array<{ kind: NotificationKind; from: string; to: string }> = [];
	if (previous.status !== next.status) {
		changes.push({ kind: 'status', from: previous.status, to: next.status });
	}
	if (previous.priority !== next.priority) {
		changes.push({ kind: 'priority', from: previous.priority, to: next.priority });
	}
	if (previous.state !== next.state) {
		changes.push({ kind: 'state', from: previous.state, to: next.state });
	}

	for (const change of changes) {
		const body = `${change.kind} changed from ${change.from} to ${change.to}`;
		for (const watcher of watchers) {
			add(watcher, change.kind, String(now), body);
		}
	}

	return drafts;
}
