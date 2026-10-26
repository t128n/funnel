import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'bun:test';

/**
 * Source contracts for the issue surface migration. The real behaviour lives
 * in the issue tests and route tests; this file proves the call sites moved to
 * the primitives layer without changing which mutations stay wired.
 */
const root = join(import.meta.dir, '..');

function read(path: string): string {
	return readFileSync(join(root, path), 'utf8');
}

function walk(path: string): string[] {
	const absolute = join(root, path);
	const entries = readdirSync(absolute, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const child = join(absolute, entry.name);
		if (entry.isDirectory()) files.push(...walk(relative(root, child)));
		else files.push(relative(root, child));
	}
	return files;
}

const INSPECTOR = 'src/lib/components/issue/InspectorPane.svelte';

describe('issue surface primitives', () => {
	test('issue surface uses primitives', () => {
		const source = read(INSPECTOR);
		expect(source).toContain('primitives/');
		expect(source).not.toContain('components/ui/');
	});

	test('inline title editor is a ghost input', () => {
		const source = read(INSPECTOR);
		const input = source.match(/<Input\b[\s\S]*?\/>/)?.[0] ?? '';
		expect(input).toContain('variant="ghost"');
		// The ghost variant owns the surface; the call site only keeps the
		// heading's semantic scale and layout.
		expect(input).not.toMatch(/rounded-|border-0|bg-transparent|shadow-|dark:|hover:bg-accent/);
	});

	test('inline description editor is a ghost textarea', () => {
		const source = read(INSPECTOR);
		const textarea = source.match(/<Textarea\b[\s\S]*?>/)?.[0] ?? '';
		expect(textarea).toContain('variant="ghost"');
	});

	test('issue tree imports primitives, not shadcn', () => {
		const files = [...walk('src/lib/components/issue'), ...walk('src/routes/(app)/issues')];
		for (const file of files) {
			if (!file.endsWith('.svelte') && !file.endsWith('.ts')) continue;
			expect(read(file), file).not.toContain('components/ui/');
		}
	});

	test('inspector pickers use pill triggers', () => {
		const priority = read('src/lib/components/issue/PriorityPicker.svelte');
		const milestone = read('src/lib/components/issue/MilestonePicker.svelte');
		expect(priority).toContain("triggerClass('pill'");
		expect(milestone).toContain("triggerClass('pill'");

		const inspector = read(INSPECTOR);
		const pills = inspector.match(/variant="pill"/g) ?? [];
		expect(pills.length).toBeGreaterThanOrEqual(4);
	});

	test('picker mutations stay wired', () => {
		const source = read(INSPECTOR);
		for (const handler of [
			'onselect={setStatus}',
			'onselect={setSize}',
			'onselect={setAssignees}',
			'onselect={setLabels}',
			'oncommit={commitPriorityAxis}',
			'onselect={(milestone) => void setMilestone(milestone)}'
		]) {
			expect(source).toContain(handler);
		}
	});

	test('titles and comments stay escaped', () => {
		const inspector = read(INSPECTOR);
		expect(inspector).toContain('Bug {number} – {title}');
		expect(inspector).toContain('{@html bodyHtml}');

		const timeline = read('src/lib/components/issue/ActivityTimeline.svelte');
		expect(timeline).toContain('{@html entry.comment.bodyHtml}');
		expect(timeline).toContain('{@html note.bodyHtml}');
	});

	test('bug markers stay', () => {
		expect(read(INSPECTOR)).toContain('bug-meta');
		expect(read('src/lib/components/issue/ActivityTimeline.svelte')).toContain('bug-comment');
		expect(read('src/lib/components/issue/IssueRow.svelte')).toContain('flag');
	});

	test('time card keeps its four-column card', () => {
		const source = read('src/lib/components/issue/IssueTimeCard.svelte');
		expect(source).toContain('timeCardRows');
		expect(source).toContain('grid-cols-4');
	});

	test('dialogs keep their dialog primitives', () => {
		for (const file of [
			'src/lib/components/issue/IssueActionDialog.svelte',
			'src/lib/components/issue/RecordDelayDialog.svelte'
		]) {
			const source = read(file);
			expect(source, file).toContain("primitives/dialog");
			expect(source, file).toContain('<Dialog.Title');
		}
	});
});
