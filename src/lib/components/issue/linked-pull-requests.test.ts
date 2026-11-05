import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
	pullRequestChecksLabel,
	pullRequestReviewLabel,
	pullRequestStateLabel,
	pullRequestSummaryIcon,
	pullRequestSummaryLabel
} from './pull-request-format';

describe('pull request formatting', () => {
	test('state includes draft, merged and closed', () => {
		expect(pullRequestStateLabel({ state: 'open', isDraft: false })).toBe('Open');
		expect(pullRequestStateLabel({ state: 'open', isDraft: true })).toBe('Draft');
		expect(pullRequestStateLabel({ state: 'merged', isDraft: false })).toBe('Merged');
		expect(pullRequestStateLabel({ state: 'closed', isDraft: false })).toBe('Closed');
	});

	test('review decisions and check rollups are readable', () => {
		expect(pullRequestReviewLabel('approved')).toBe('Approved');
		expect(pullRequestReviewLabel('changes_requested')).toBe('Changes requested');
		expect(pullRequestReviewLabel('review_required')).toBe('Review required');
		expect(pullRequestReviewLabel(null)).toBeNull();
		expect(
			pullRequestChecksLabel({ state: 'failure', total: 4, failed: 2, url: null })
		).toBe('Checks failing (2 failed)');
		expect(
			pullRequestChecksLabel({ state: 'pending', total: 4, failed: 0, url: null })
		).toBe('Checks pending');
		expect(pullRequestChecksLabel(null)).toBeNull();
	});

	test('summary names states and the worst check result', () => {
		expect(
			pullRequestSummaryLabel({
				total: 2,
				open: 1,
				merged: 1,
				closed: 0,
				checksState: 'failure',
				checksFailed: 3
			})
		).toBe('2 linked pull requests · 1 open · 1 merged · checks failing (3 failed)');
		expect(
			pullRequestSummaryIcon({
				total: 1,
				open: 0,
				merged: 1,
				closed: 0,
				checksState: 'success',
				checksFailed: 0
			})
		).toContain('text-success');
	});
});

describe('linked pull request panel', () => {
	const source = readFileSync(new URL('./LinkedPullRequests.svelte', import.meta.url), 'utf8');

	test('renders state, reviews, checks and an outbound GitHub link', () => {
		expect(source).toContain('Pull requests');
		expect(source).toContain('pullRequestStateLabel');
		expect(source).toContain('pullRequestReviewLabel');
		expect(source).toContain('pullRequestChecksLabel');
		expect(source).toContain('href={pr.url');
		expect(source).toContain('target="_blank"');
		expect(source).toContain('No pull requests are linked to this issue');
	});
});
