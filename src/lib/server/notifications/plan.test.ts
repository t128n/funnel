import { describe, expect, test } from 'bun:test';
import { parseMentions, planIssueNotifications } from './plan';
import type { IssueCommentSnapshot, IssueSnapshot, Recipient } from './types';

const alice: Recipient = {
	userId: 'u1',
	githubId: 42,
	login: 'alice',
	avatarUrl: 'https://avatars/42'
};
const bob: Recipient = {
	userId: 'u2',
	githubId: 43,
	login: 'bob',
	avatarUrl: 'https://avatars/43'
};

function snapshot(overrides: Partial<IssueSnapshot> = {}): IssueSnapshot {
	return {
		status: 'todo',
		priority: 'p2',
		state: 'open',
		updatedAt: 1000,
		assigneeIds: [],
		comments: [],
		title: 'Fix the thing',
		number: 7,
		...overrides
	};
}

function comment(githubId: number, body: string, authorLogin = 'carol'): IssueCommentSnapshot {
	return { githubId, body, authorLogin, authorAvatarUrl: 'https://avatars/99' };
}

const base = {
	repo: 'orgA/core',
	watchers: [] as Recipient[],
	recipients: [] as Recipient[],
	actor: null,
	now: 1000
};

describe('parseMentions', () => {
	test('returns unique lowercase logins in order', () => {
		expect(parseMentions('hi @alice and @bob, @Alice')).toEqual(['alice', 'bob']);
	});

	test('ignores email addresses and keeps hyphens', () => {
		expect(parseMentions('mail a@b.com, ask @alice-2.')).toEqual(['alice-2']);
	});
});

describe('planIssueNotifications', () => {
	test('test_initial_snapshot_is_silent', () => {
		expect(
			planIssueNotifications({
				...base,
				previous: null,
				next: snapshot({ assigneeIds: [42], comments: [comment(500, 'hello @alice')] }),
				watchers: [alice],
				recipients: [alice]
			})
		).toEqual([]);
	});

	test('test_self_actor_suppressed', () => {
		const drafts = planIssueNotifications({
			...base,
			previous: snapshot(),
			next: snapshot({ assigneeIds: [42] }),
			recipients: [alice],
			actor: alice
		});
		expect(drafts).toEqual([]);
	});

	test('test_mention_beats_comment_for_same_comment', () => {
		const drafts = planIssueNotifications({
			...base,
			previous: snapshot(),
			next: snapshot({ comments: [comment(500, 'hey @alice, take a look')] }),
			watchers: [alice],
			recipients: [alice]
		});
		expect(drafts).toHaveLength(1);
		expect(drafts[0]).toMatchObject({
			userId: alice.userId,
			kind: 'mentioned',
			createdAt: 1000,
			url: '/issues/orgA/core/7'
		});
	});

	test('notifies a new assignee once with the event dedupe key', () => {
		const drafts = planIssueNotifications({
			...base,
			previous: snapshot(),
			next: snapshot({ assigneeIds: [42] }),
			recipients: [alice]
		});
		expect(drafts).toHaveLength(1);
		expect(drafts[0]).toMatchObject({
			userId: alice.userId,
			kind: 'assigned',
			dedupeKey: 'assigned:orgA/core#7:u1:1000',
			createdAt: 1000
		});
	});

	test('does not repeat an assignment that was already known', () => {
		const drafts = planIssueNotifications({
			...base,
			previous: snapshot({ assigneeIds: [42] }),
			next: snapshot({ assigneeIds: [42] }),
			recipients: [alice]
		});
		expect(drafts).toEqual([]);
	});

	test('notifies watchers about new comments but not known ones', () => {
		const previous = snapshot({ comments: [comment(499, 'older')] });
		const drafts = planIssueNotifications({
			...base,
			previous,
			next: snapshot({
				comments: [comment(499, 'older'), comment(500, '  a   new\ncomment  ')]
			}),
			watchers: [alice, bob]
		});
		expect(drafts.map((draft) => `${draft.userId}:${draft.kind}`)).toEqual([
			'u1:comment',
			'u2:comment'
		]);
		expect(drafts[0].body).toBe('a new comment');
	});

	test('does not notify the comment author on a watched issue', () => {
		const drafts = planIssueNotifications({
			...base,
			previous: snapshot(),
			next: snapshot({ comments: [comment(500, 'my own comment', 'alice')] }),
			watchers: [alice]
		});
		expect(drafts).toEqual([]);
	});

	test('notifies watchers for status, priority and state changes', () => {
		const drafts = planIssueNotifications({
			...base,
			previous: snapshot({ status: 'todo', priority: 'p2', state: 'open' }),
			next: snapshot({ status: 'in-progress', priority: 'p1', state: 'closed' }),
			watchers: [alice]
		});
		expect(drafts.map((draft) => draft.kind)).toEqual(['status', 'priority', 'state']);
		expect(new Set(drafts.map((draft) => draft.dedupeKey)).size).toBe(3);
	});

	test('strips HTML comments and truncates the excerpt to 140 characters', () => {
		const body = `<!-- hidden -->${'word '.repeat(40)}`;
		const drafts = planIssueNotifications({
			...base,
			previous: snapshot(),
			next: snapshot({ comments: [comment(500, body)] }),
			watchers: [alice]
		});
		expect(drafts[0].body).toBe('word '.repeat(28).trim());
		expect((drafts[0].body ?? '').length).toBeLessThanOrEqual(140);
	});
});
