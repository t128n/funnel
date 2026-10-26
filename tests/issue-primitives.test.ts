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

function issueSourceFiles(): string[] {
	return [...walk('src/lib/components/issue'), ...walk('src/routes/(app)/issues')].filter(
		(file) => file.endsWith('.svelte') || file.endsWith('.ts')
	);
}

const INSPECTOR = 'src/lib/components/issue/InspectorPane.svelte';
const ACTION_DIALOG = 'src/lib/components/issue/IssueActionDialog.svelte';
const DELAY_DIALOG = 'src/lib/components/issue/RecordDelayDialog.svelte';

/** Component name -> primitive family it must be imported from. */
const PRIMITIVE_FAMILIES: Record<string, string> = {
	Button: 'button',
	Input: 'input',
	Textarea: 'textarea',
	Dialog: 'dialog',
	Popover: 'popover',
	Command: 'command',
	DropdownMenu: 'dropdown-menu',
	Empty: 'empty',
	Alert: 'alert',
	Field: 'field',
	Message: 'message',
	Bubble: 'bubble',
	Tooltip: 'tooltip',
	NativeSelect: 'native-select'
};

/** The picker wrapper block in the Inspector, up to its closing element. */
function pickerBlock(source: string, field: string): string {
	const start = source.indexOf(`data-picker="${field}"`);
	expect(start, `data-picker="${field}"`).toBeGreaterThan(-1);
	const end = source.indexOf('</div>', start);
	expect(end, `closing tag for data-picker="${field}"`).toBeGreaterThan(start);
	return source.slice(start, end);
}

describe('issue surface primitives', () => {
	test('issue surface uses primitives', () => {
		const source = read(INSPECTOR);
		expect(source).toContain('primitives/');
		expect(source).not.toContain('components/ui/');
	});

	test('every primitive call site imports its primitive family', () => {
		for (const file of issueSourceFiles()) {
			if (!file.endsWith('.svelte')) continue;
			const source = read(file);
			const used = new Set<string>();
			for (const match of source.matchAll(/<([A-Z][A-Za-z]*)(?:\.[A-Z][A-Za-z]*)?\b/g)) {
				const family = PRIMITIVE_FAMILIES[match[1]];
				if (family) used.add(family);
			}
			for (const family of used) {
				expect(source, `${file} imports primitives/${family}`).toMatch(
					new RegExp(`from ['"]#lib/components/primitives/${family}(?:/index\\.js)?['"]`)
				);
			}
		}
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
		expect(textarea).not.toMatch(/rounded-|border-0|bg-transparent|shadow-|dark:/);
	});

	test('click-to-edit keeps its handlers, roles and accessible names', () => {
		const source = read(INSPECTOR);
		for (const snippet of [
			'oninput={(e) => (title = e.currentTarget.value)}',
			'onblur={saveTitle}',
			'onclick={() => mayWrite && isPlainClick() && startTitleEdit()}',
			"role={mayWrite ? 'button' : undefined}",
			"aria-label={mayWrite ? 'Issue title; activate to edit' : 'Issue title'}",
			'oninput={(e) => (body = e.currentTarget.value)}',
			'onkeydown={onBodyKeydown}',
			'onclick={() => mayWrite && isPlainClick() && (editingBody = true)}',
			"aria-label={mayWrite ? 'Issue description; activate to edit' : 'Issue description'}"
		]) {
			expect(source, snippet).toContain(snippet);
		}
	});

	test('issue tree imports primitives, not shadcn', () => {
		for (const file of issueSourceFiles()) {
			expect(read(file), file).not.toContain('components/ui/');
		}
	});

	test('inspector pickers use pill triggers', () => {
		const priority = read('src/lib/components/issue/PriorityPicker.svelte');
		const milestone = read('src/lib/components/issue/MilestonePicker.svelte');
		expect(priority).toContain("triggerClass('pill'");
		expect(milestone).toContain("triggerClass('pill'");

		const inspector = read(INSPECTOR);
		for (const field of ['status', 'size', 'assignee', 'labels']) {
			expect(pickerBlock(inspector, field), `data-picker="${field}"`).toContain(
				'variant="pill"'
			);
		}
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
		// Only the server-sanitized HTML may reach `{@html}`; the unrendered
		// body falls back to a normal (escaped) interpolation.
		expect(inspector).not.toContain('{@html body}');
		expect(inspector).toContain('{body}');

		const timeline = read('src/lib/components/issue/ActivityTimeline.svelte');
		expect(timeline).toContain('{@html entry.comment.bodyHtml}');
		expect(timeline).toContain('{@html note.bodyHtml}');
		expect(timeline).not.toContain('{@html entry.comment.body}');
	});

	test('bug markers stay', () => {
		const inspector = read(INSPECTOR);
		expect(inspector).toContain('<dl class="bug-meta">');
		expect(inspector).toContain('class="bug-meta-label"');

		const timeline = read('src/lib/components/issue/ActivityTimeline.svelte');
		expect(timeline).toContain("cn('bug-comment'");
		expect(timeline).toContain('class="bug-comment-body markdown"');

		const row = read('src/lib/components/issue/IssueRow.svelte');
		expect(row).toContain("cn('flag shrink-0', statusClass)");
		expect(row).toContain('class="flag flag-muted block truncate"');
	});

	test('time card keeps its four-column card', () => {
		const source = read('src/lib/components/issue/IssueTimeCard.svelte');
		expect(source).toContain('timeCardRows(time)');
		expect(source).toContain('grid-cols-4');
		expect(source).toContain('aria-label="Time"');
		expect(source).toContain('{#each rows as row (row.key)}');
	});

	test('delay dialog keeps its native interval fields and payload', () => {
		const source = read(DELAY_DIALOG);
		expect(source).toContain("import { Input } from '#lib/components/primitives/input'");
		expect(source).toContain(
			'<Input id="delay-start" type="datetime-local" bind:value={started} />'
		);
		expect(source).toContain('<Input id="delay-end" type="datetime-local" bind:value={ended} />');
		expect(source).toContain('const startIso = $derived(localToIso(started));');
		expect(source).toContain('started_at: startIso');
		expect(source).toContain('...(endIso !== null ? { ended_at: endIso } : {})');
		expect(source).toContain('note: note.trim()');

		// The Inspector still opens this exact dialog from the delay row.
		const inspector = read(INSPECTOR);
		expect(inspector).toContain('onrecord={() => (delayDialogOpen = true)}');
		expect(inspector).toContain('open={delayDialogOpen}');
	});

	test('resolution choices stay native radios without shadcn overrides', () => {
		const source = read(ACTION_DIALOG);
		const group = source.slice(source.indexOf('role="radiogroup"'));
		const labels = group.slice(0, group.indexOf('</Field.Set>'));
		expect(labels.match(/type="radio"/g)?.length).toBe(2);
		expect(labels.match(/name="resolution"/g)?.length).toBe(2);
		expect(labels).toContain('value="completed"');
		expect(labels).toContain('value="not_planned"');
		expect(labels).toContain("checked={reason === 'completed'}");
		expect(labels).toContain("onchange={() => (reason = 'completed')}");
		expect(labels).toContain("checked={reason === 'not_planned'}");
		expect(labels).toContain("onchange={() => (reason = 'not_planned')}");
		// T9 removed the shadcn card chrome; only layout and spacing remain on
		// the Field.Label call sites.
		expect(source).not.toMatch(/has-data-checked|dark:|rounded-md|border-ring/);
	});

	test('dialogs keep their dialog primitives', () => {
		for (const file of [ACTION_DIALOG, DELAY_DIALOG]) {
			const source = read(file);
			expect(source, file).toContain('primitives/dialog');
			expect(source, file).toContain('<Dialog.Title');
			expect(source, file).toContain('<Dialog.Footer>');
			expect(source, file).toContain('<Dialog.Close');
		}
	});
});
