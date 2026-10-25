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

describe('bugzilla board cards', () => {
	test('cards are flat bordered articles', () => {
		expect(source).toContain('<article');
		expect(source).toContain('border-[color:var(--border)]');
		expect(source).toContain('bg-[var(--card)]');
		expect(source).toContain('rounded-none');
		expect(source).toContain('shadow-none');
	});

	test('no tinted surfaces, pills or avatars survive', () => {
		expect(source).not.toContain('--surface-');
		expect(source).not.toContain('MetaTag');
		expect(source).not.toContain('PriorityBadge');
		expect(source).not.toContain('PriorityIcon');
		expect(source).not.toContain('StatusIcon');
		expect(source).not.toContain('Avatar');
		expect(source).not.toContain('rotate(2deg)');
	});

	test('the drag source keeps the same payload', () => {
		expect(source).toContain('use:draggableCard={dragPayload}');
		expect(source).toContain('data-board-card={key}');
	});
});

describe('bugzilla board lanes', () => {
	const column = readFileSync(new URL('./BoardColumn.svelte', import.meta.url), 'utf8');

	test('lane header is a grey cell with a count and a hover link', () => {
		expect(column).toContain('bg-[var(--muted)]');
		expect(column).toContain('uppercase');
		expect(column).toContain('border-b border-border');
		expect(column).toContain('+ New');
		expect(column).toContain('link');
	});

	test('drop indicator is a 2px primary line', () => {
		expect(column).toContain('data-board-drop-indicator');
		expect(column).toContain('bg-primary');
		expect(column).toContain('h-0.5');
		expect(column).not.toContain('--surface-');
	});

	test('drop-target wiring and data attributes are unchanged', () => {
		expect(column).toContain('use:droppableLane={laneHandlers}');
		expect(column).toContain('data-board-column={statusKey}');
		expect(column).toContain('data-board-card-index={index}');
	});
});
