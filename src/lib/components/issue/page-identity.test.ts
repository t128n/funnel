import { describe, expect, test } from 'bun:test';
import { issuesIdentity } from './page-identity';

describe('issuesIdentity', () => {
	test('identifies the assignee=me view as My Issues', () => {
		expect(issuesIdentity({ assignees: ['me'] })).toEqual({
			myIssues: true,
			title: 'My Issues',
			description: 'Issues assigned to you, grouped for scanning.'
		});
	});

	test('keeps the generic Issues identity for every other assignee filter', () => {
		for (const assignees of [[], ['demo'], ['me', 'demo'], ['none']]) {
			expect(issuesIdentity({ assignees })).toEqual({
				myIssues: false,
				title: 'Issues',
				description: 'Every open issue in the current scope, grouped for scanning.'
			});
		}
	});
});
