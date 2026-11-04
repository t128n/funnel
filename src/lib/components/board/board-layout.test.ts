import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

/**
 * Board page geometry contract (issue #100).
 *
 * The lane virtualizer needs a definite height, but a fixed `60svh` canvas
 * leaves dead space and clips the lane edge. The board owns the viewport below
 * the app bar instead, and Backlog sizes to its rows.
 */
const page = readFileSync(
	new URL('../../../routes/(app)/board/+page.svelte', import.meta.url),
	'utf8'
);
const css = readFileSync(new URL('../../../lib/styles/app.css', import.meta.url), 'utf8');

describe('board page geometry', () => {
	test('fills the viewport below the app bar instead of a fixed 60svh box', () => {
		expect(page).toContain('board-page');
		expect(page).toContain('calc(100dvh - var(--funnel-app-bar-height))');
		expect(page).not.toContain('height: 60svh');
		expect(css).toContain('--funnel-app-bar-height: 3.5rem');
	});

	test('the lane canvas flexes and keeps a minimum height', () => {
		expect(page).toContain('board-canvas--lanes');
		expect(page).toContain('flex: 1 1 auto');
		expect(page).toContain('min-height: 24rem');
	});

	test('backlog sizes to its content rather than the board frame', () => {
		expect(page).toContain('board-canvas--content');
		expect(page).toContain('flex: 0 0 auto');
	});
});
