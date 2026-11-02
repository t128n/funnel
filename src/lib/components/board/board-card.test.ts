import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

/**
 * Board card contracts (plan T7).
 *
 * Bun has no Svelte loader, so the pure token helper is transpiled out of the
 * component's module script and evaluated in isolation; the flat-card markup
 * is checked by source read, the same way `issue-row.test.ts` checks its row.
 */
const source = readFileSync(new URL('./BoardCard.svelte', import.meta.url), 'utf8');

function moduleExport(source: string, name: string): unknown {
	const block = source.match(/<script module[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? '';
	const stripped = block.replace(/^(\s*)export\s+/gm, '$1');
	const js = new Bun.Transpiler({ loader: 'ts' }).transformSync(stripped);
	return new Function(`${js}\nreturn ${name};`)();
}

const cardToken = moduleExport(source, 'cardToken') as (
	priority: string | null,
	size: string | null
) => string;

describe('cardToken', () => {
	test('joins priority and size with a middot', () => {
		expect(cardToken('P1', 'sm')).toBe('P1 · S');
		expect(cardToken('P2', 'md')).toBe('P2 · M');
		expect(cardToken('P3', 'lg')).toBe('P3 · L');
	});

	test('omits blank parts', () => {
		expect(cardToken(null, null)).toBe('');
		expect(cardToken('P1', null)).toBe('P1');
		expect(cardToken(null, 'sm')).toBe('S');
		expect(cardToken('', '   ')).toBe('');
	});
});

describe('t128n board cards', () => {
	test('cards are canvas articles with a subtle rule and medium radius', () => {
		expect(source).toContain('<article');
		expect(source).toContain('border-border-subtle');
		expect(source).toContain('bg-canvas');
		expect(source).toContain('rounded-md');
		expect(source).not.toContain('shadow-');
	});

	test('no tinted surfaces, flags, pills or avatars survive', () => {
		expect(source).not.toContain('--surface-');
		expect(source).not.toContain('flag-');
		expect(source).not.toContain('MetaTag');
		expect(source).not.toContain('PriorityBadge');
		expect(source).not.toContain('PriorityIcon');
		expect(source).not.toContain('StatusIcon');
		expect(source).not.toContain('Avatar');
		expect(source).not.toContain('rotate(2deg)');
	});

	test('card anatomy: mono ref, two-line title, caption metadata', () => {
		expect(source).toContain('RefText');
		expect(source).toContain('line-clamp-2');
		expect(source).toContain('text-body leading-[1.35] font-semibold');
		expect(source).toContain('PriorityText');
		expect(source).toContain('StatusText blocked');
		expect(source).toContain('text-caption text-fg-secondary');
	});

	test('interaction states: border-strong hover, leading bar, dimmed drag', () => {
		expect(source).toContain('hover:border-border-strong');
		expect(source).toContain('is-selected-row');
		expect(source).toContain("dragging && 'opacity-50'");
	});

	test('the drag source keeps the same payload and hooks', () => {
		expect(source).toContain('use:draggableCard={dragPayload}');
		expect(source).toContain('data-board-card={key}');
	});
});

describe('t128n board lanes', () => {
	const column = readFileSync(new URL('./BoardColumn.svelte', import.meta.url), 'utf8');
	const board = readFileSync(new URL('./StatusBoard.svelte', import.meta.url), 'utf8');

	test('lanes use the board-lane token, canvas, subtle rule and medium radius', () => {
		expect(column).toContain('w-[var(--layout-board-lane)]');
		expect(column).toContain('border-border-subtle');
		expect(column).toContain('bg-canvas');
		expect(column).toContain('rounded-md');
		expect(column).toContain('snap-start');
		expect(column).not.toContain('shadow-');
	});

	test('lane header sits on surface-2 with stage, count and WIP', () => {
		expect(column).toContain('bg-surface-2');
		expect(column).toContain('text-body font-semibold');
		expect(column).not.toContain('uppercase');
		expect(column).toContain('{total} / {limit}');
		expect(column).toContain('Over WIP');
	});

	test('empty lane offers "No issues" and a ghost New Issue', () => {
		expect(column).toContain('No issues');
		expect(column).toContain('New Issue');
		expect(column).toContain('variant="ghost"');
	});

	test('drop indicator is a 2px primary line and the target takes surface-2', () => {
		expect(column).toContain('data-board-drop-indicator');
		expect(column).toContain('h-0.5 bg-primary');
		expect(column).toContain('bg-surface-2');
	});

	test('drop-target wiring and data attributes are unchanged', () => {
		expect(column).toContain('use:droppableLane={laneHandlers}');
		expect(column).toContain('data-board-column={statusKey}');
		expect(column).toContain('data-board-card-index={index}');
	});

	test('lanes scroll independently and snap horizontally on mobile', () => {
		expect(column).toContain('overflow-y-auto');
		expect(board).toContain('snap-x snap-mandatory');
		expect(board).toContain('md:snap-none');
	});
});
