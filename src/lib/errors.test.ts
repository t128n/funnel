import { describe, expect, test } from 'bun:test';
import {
	describeError,
	describeStatus,
	errorSection,
	isRetryable,
	isServerError,
	recoveryFor,
	safeErrorMessage
} from './errors';

describe('describeError', () => {
	test('maps known statuses to friendly copy', () => {
		expect(describeError(404).title).toBe('Page not found');
		expect(describeError(500).title).toBe('Something went wrong');
	});

	test('falls back to a generic server error for unknown 5xx', () => {
		expect(describeError(599)).toEqual(describeError(500));
	});

	test('falls back to a status-labelled error for unknown 4xx', () => {
		const copy = describeError(418);
		expect(copy.title).toBe('Request failed');
		expect(copy.description).toContain('418');
	});
});

describe('isServerError', () => {
	test('is true for 5xx only', () => {
		expect(isServerError(500)).toBe(true);
		expect(isServerError(503)).toBe(true);
		expect(isServerError(499)).toBe(false);
		expect(isServerError(404)).toBe(false);
	});
});

describe('safeErrorMessage', () => {
	test('passes a client message through', () => {
		expect(safeErrorMessage(404, 'Issue not found')).toBe('Issue not found');
	});

	test('hides any 5xx message', () => {
		expect(safeErrorMessage(500, 'ECONNREFUSED 10.0.0.5')).toBe(
			describeError(500).description,
		);
	});

	test('falls back to the description when empty', () => {
		expect(safeErrorMessage(404, '   ')).toBe(describeError(404).description);
		expect(safeErrorMessage(404, undefined)).toBe(describeError(404).description);
	});
});

describe('isRetryable', () => {
	test('retries only transient failures', () => {
		expect(isRetryable(500)).toBe(true);
		expect(isRetryable(503)).toBe(true);
		expect(isRetryable(408)).toBe(true);
		expect(isRetryable(429)).toBe(true);
		expect(isRetryable(404)).toBe(false);
		expect(isRetryable(403)).toBe(false);
		expect(isRetryable(409)).toBe(false);
	});
});

describe('errorSection', () => {
	test('maps list and detail routes to their section', () => {
		expect(errorSection('/issues')).toBe('issues');
		expect(errorSection('/issues/demo/funnel/999')).toBe('issues');
		expect(errorSection('/milestones/demo/funnel/999')).toBe('milestones');
		expect(errorSection('/epics/demo/funnel/12')).toBe('epics');
		expect(errorSection('/inbox/submission/abc')).toBe('inbox');
		expect(errorSection('/nonexistent-route')).toBe('app');
	});
});

describe('describeStatus', () => {
	test('names the missing entity instead of a generic page', () => {
		expect(describeStatus(404, 'issues')).toEqual({
			title: 'Issue not found',
			description: 'This issue does not exist or is not available.',
		});
		expect(describeStatus(404, 'milestones').title).toBe('Milestone not found');
		expect(describeStatus(404, 'epics').title).toBe('Epic not found');
		expect(describeStatus(404, 'inbox').title).toBe('Submission not found');
	});

	test('keeps generic copy for a root 404 and for server failures', () => {
		expect(describeStatus(404, 'app').title).toBe('Page not found');
		expect(describeStatus(500, 'issues')).toEqual(describeError(500));
	});

	test('never exposes internal sync vocabulary', () => {
		for (const section of ['issues', 'milestones', 'epics', 'inbox'] as const) {
			const copy = describeStatus(404, section);
			expect(`${copy.title} ${copy.description}`).not.toContain('mirrored');
		}
	});
});

describe('recoveryFor', () => {
	test('returns the matching list for each section', () => {
		expect(recoveryFor('issues')).toEqual({ href: '/issues', label: 'Back to Issues' });
		expect(recoveryFor('milestones')).toEqual({
			href: '/milestones',
			label: 'Back to Milestones',
		});
		expect(recoveryFor('epics')).toEqual({ href: '/epics', label: 'Back to Epics' });
		expect(recoveryFor('inbox')).toEqual({ href: '/inbox', label: 'Back to Inbox' });
		expect(recoveryFor('app')).toEqual({ href: '/issues', label: 'Back to Issues' });
	});
});
