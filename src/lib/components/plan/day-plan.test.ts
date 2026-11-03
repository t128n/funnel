/**
 * Day-plan contracts (SPEC §9).
 *
 * `planBlockLabel` lives in `DayPlan.svelte`'s module script because it is the
 * day block's only presentation logic. Bun has no Svelte loader, so extract
 * that module script, transpile the TypeScript and evaluate it in isolation:
 * the helper is pure and imports nothing. The markup assertions read the three
 * plan surfaces and guard the Bugzilla table-first language.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

function source(relative: string): string {
	return readFileSync(new URL(relative, import.meta.url), 'utf8');
}

const dayPlan = source('./DayPlan.svelte');
const lanes = source('./PlanLanes.svelte');
const page = source('../../../routes/(app)/plan/+page.svelte');

const moduleSource = dayPlan.match(/<script\s+module[^>]*>([\s\S]*?)<\/script>/)?.[1];

if (!moduleSource) {
	throw new Error('DayPlan.svelte must export planBlockLabel from a <script module> block');
}

const moduleJs = new Bun.Transpiler({ loader: 'ts' }).transformSync(moduleSource);
const moduleUrl = `data:text/javascript;base64,${Buffer.from(moduleJs).toString('base64')}`;
const { planBlockLabel } = (await import(moduleUrl)) as {
	planBlockLabel: (start: number, end: number) => string;
};

describe('planBlockLabel', () => {
	test('test_block_label_is_an_en_dash_range', () => {
		expect(planBlockLabel(540, 630)).toBe('09:00–10:30');
		expect(planBlockLabel(540, 630)).not.toContain('-');
	});

	test('test_block_label_pads_zeroes', () => {
		expect(planBlockLabel(5, 65)).toBe('00:05–01:05');
		expect(planBlockLabel(0, 1440)).toBe('00:00–24:00');
	});
});

describe('plan surfaces', () => {
	test('test_day_blocks_use_the_time_range', () => {
		expect(dayPlan).toContain('planBlockLabel(block.startMinute');
	});

	test('test_plan_surfaces_use_structural_tokens_only', () => {
		for (const file of [dayPlan, lanes, page]) {
			expect(file).not.toContain('var(--surface-');
		}
		// Lanes are ruled sections with quiet headings, not filled header bars or cards.
		expect(lanes).not.toContain('bg-surface-2');
		expect(lanes).toContain('border-bottom');
		expect(lanes).toContain('border-top');
		expect(lanes).not.toContain('bug-table-head');
		// Blocks get a 2px primary leading edge and 1px structural rules.
		expect(dayPlan).toContain('var(--bs-border-color)');
		expect(dayPlan).toContain('border-inline-start: 2px solid var(--bs-primary)');
	});
});
