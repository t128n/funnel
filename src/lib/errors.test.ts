import { describe, expect, test } from 'bun:test';
import { describeError, isServerError, safeErrorMessage } from './errors';

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
