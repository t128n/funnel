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

describe('board cards', () => {
	test('cards are plain bordered items with a subtle rule, medium radius, 8px inset', () => {
		expect(source).toContain('<article');
		expect(source).toContain('border bg-body');
		expect(source).toContain('rounded');
		expect(source).toContain('px-2 py-2');
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

	test('card anatomy: ref + menu, two-line title, priority/size, trailing assignee', () => {
		expect(source).toContain('RefText');
		expect(source).toContain('Issue actions');
		expect(source).toContain('board-card-title');
		expect(source).toContain('-webkit-line-clamp: 2');
		expect(source).toContain('title={issue.title}');
		expect(source).toContain('d-flex align-items-start gap-1 small lh-sm');
		expect(source).toContain('PriorityText');
		expect(source).toContain('StatusText blocked');
		expect(source).toContain('board-card-meta');
		expect(source).toContain('text-body-secondary');
		expect(source).toContain('ms-auto');
		// A dense list title is normal weight, not semibold.
		expect(source).not.toContain('small fw-semibold');
		expect(source).toContain('font-size: 0.75rem');
	});

	test('cards drop labels, extra metadata and completed strikethrough', () => {
		expect(source).not.toContain('labelText');
		expect(source).not.toContain('canonicalLabel');
		expect(source).not.toContain('showRepo');
		expect(source).not.toContain('line-through');
	});

	test('interaction states: border-strong hover and dimmed drag', () => {
		expect(source).toContain('.board-card:hover');
		expect(source).toContain('border-color: var(--bs-secondary-color)');
		expect(source).not.toContain('is-selected-row');
		expect(source).toContain('class:opacity-50={dragging}');
	});

	test('the drag source keeps the same payload and hooks', () => {
		expect(source).toContain('use:draggableCard={dragPayload}');
		expect(source).toContain('data-board-card={key}');
	});

	test('the actions menu escapes the lane scroller and virtualized cards', () => {
		expect(source).toContain('use:fixedMenu');
		expect(source).toContain('role="menu"');
		expect(source).toContain('aria-expanded={menuOpen}');
		// The stock menu would stay inside the lane's overflow container.
		expect(source).not.toContain('DropdownMenu');
		expect(source).not.toContain('DropdownToggle');
	});
});

describe('board lanes', () => {
	const column = readFileSync(new URL('./BoardColumn.svelte', import.meta.url), 'utf8');
	const board = readFileSync(new URL('./StatusBoard.svelte', import.meta.url), 'utf8');

	test('lanes are ruled columns, not bordered containers', () => {
		expect(column).toContain('board-lane');
		expect(column).toContain('--funnel-board-lane-width');
		expect(column).toContain('scroll-snap-align: start');
		expect(column).not.toContain('rounded-md');
		expect(column).not.toContain('border border-border-subtle');
		expect(column).not.toContain('bg-canvas');
		expect(column).not.toContain('shadow-');
	});

	test('lane header is quiet: no fill, bottom rule, stage, count and WIP', () => {
		const header = column.split('<header')[1]?.split('</header>')[0] ?? '';
		expect(header).toContain('border-bottom');
		expect(header).not.toContain('bg-body-secondary');
		expect(column).toContain('text-body fw-semibold');
		expect(column).not.toContain('uppercase');
		expect(column).toContain('{total} / {limit}');
		expect(column).toContain('Over WIP');
	});

	test('empty lane offers "No issues" and a link-style New Issue', () => {
		expect(column).toContain('No issues');
		expect(column).toContain('New Issue');
		expect(column).toContain('color="link"');
	});

	test('drop indicator is a 2px primary line and the target takes the secondary background', () => {
		expect(column).toContain('data-board-drop-indicator');
		expect(column).toContain('board-drop-indicator');
		expect(column).toContain('height: 2px');
		expect(column).toContain('background: var(--bs-primary)');
		expect(column).toContain('board-lane__body--target');
		expect(column).toContain('background: var(--bs-secondary-bg)');
	});

	test('drop-target wiring and data attributes are unchanged', () => {
		expect(column).toContain('use:droppableLane={laneHandlers}');
		expect(column).toContain('data-board-column={statusKey}');
		expect(column).toContain('data-board-card-index={index}');
	});

	test('lanes scroll independently and snap horizontally on mobile', () => {
		expect(column).toContain('overflow-y-auto');
		expect(board).toContain('.status-board');
		expect(board).toContain('scroll-snap-type: x mandatory');
		expect(board).toContain('scroll-snap-type: none');
		expect(board).toContain('gap-2');
	});
});
