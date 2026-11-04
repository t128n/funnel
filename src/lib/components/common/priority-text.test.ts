import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';
import { prioritySpokenLabel } from './priority-text';

const source = readFileSync(new URL('./PriorityText.svelte', import.meta.url), 'utf8');

describe('prioritySpokenLabel', () => {
	test('announces the token once with the level name once', () => {
		expect(prioritySpokenLabel('P1', 'High')).toBe('P1, high priority');
		expect(prioritySpokenLabel('P2', 'Medium')).toBe('P2, medium priority');
		expect(prioritySpokenLabel('P3', 'Low')).toBe('P3, low priority');
	});

	test('does not repeat the level name', () => {
		for (const [priority, name] of [
			['P1', 'High'],
			['P2', 'Medium'],
			['P3', 'Low']
		]) {
			const spoken = prioritySpokenLabel(priority, name);
			expect(spoken).toContain(priority);
			expect(spoken.toLowerCase().split(name.toLowerCase())).toHaveLength(2);
		}
	});
});

describe('PriorityText accessibility wiring', () => {
	test('hides the visible token and name from assistive technology', () => {
		expect(source).toContain('<span aria-hidden="true">{priority}</span>');
		expect(source).toContain('<span aria-hidden="true">{meta.name}</span>');
	});

	test('announces one complete label through the visually hidden text', () => {
		expect(source).toContain(
			'<span class="visually-hidden">{prioritySpokenLabel(priority, meta.name)}</span>'
		);
		expect(source).not.toContain(', {meta.name} priority');
	});

	test('keeps the visible token and level name unchanged', () => {
		expect(source).toContain('{priority}');
		expect(source).toContain('{meta.name}');
		expect(source).toContain('title={`${priority} · ${meta.name} priority`}');
	});
});
