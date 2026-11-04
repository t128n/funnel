import { describe, expect, test } from 'bun:test';
import { inlineLabels, MAX_INLINE_LABELS } from './labels-inline';

describe('inlineLabels', () => {
	test('keeps the title line to at most two labels', () => {
		expect(MAX_INLINE_LABELS).toBe(2);
		expect(inlineLabels([])).toEqual({ shown: [], overflow: 0 });
		expect(inlineLabels(['frontend'])).toEqual({ shown: ['frontend'], overflow: 0 });
		expect(inlineLabels(['frontend', 'infra'])).toEqual({
			shown: ['frontend', 'infra'],
			overflow: 0
		});
	});

	test('collapses the remainder into a +N badge', () => {
		expect(inlineLabels(['frontend', 'infra', 'docs'])).toEqual({
			shown: ['frontend', 'infra'],
			overflow: 1
		});
		expect(inlineLabels(['a', 'b', 'c', 'd', 'e'])).toEqual({
			shown: ['a', 'b'],
			overflow: 3
		});
	});

	test('does not mutate the source list', () => {
		const labels = ['frontend', 'infra', 'docs'];
		inlineLabels(labels);
		expect(labels).toEqual(['frontend', 'infra', 'docs']);
	});
});
