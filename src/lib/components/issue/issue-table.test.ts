import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

/**
 * `IssueTable.svelte`'s responsive column contract and its keyboard model are
 * markup structure, not pure functions. Bun has no Svelte loader, so assert on
 * the source the same way the other component tests in this folder do.
 */
const source = readFileSync(new URL('./IssueTable.svelte', import.meta.url), 'utf8');

describe('IssueTable keyboard model', () => {
	test('rows add no tab stop; the title link and checkbox stay the stops', () => {
		expect(source).not.toContain('tabindex="0"');
		expect(source).toContain('type="checkbox"');
		expect(source).toContain('aria-label={`Select ${refOf(issue)}');
	});

	test('the row stays clickable for the mouse without hijacking controls', () => {
		expect(source).toContain('onclick={(event) => onRowClick(event, issue)}');
		expect(source).toContain('.issue-row {\n\t\tcursor: pointer;');
		expect(source).toContain('window.getSelection()?.toString()');
		expect(source).toContain("target.closest('a, button, input, select, textarea, label')");
	});

	test('x toggles the focused row and Space stays native on the checkbox', () => {
		expect(source).toContain('onkeydown={onTableKeydown}');
		expect(source).toContain("event.key !== 'x' && event.key !== 'X'");
		expect(source).toContain('bulkSelection.toggle(key as BulkKey)');
	});

	test('select-all covers the loaded window with a mixed state', () => {
		expect(source).toContain('bulkSelection.toggleMany(selectableKeys)');
		expect(source).toContain('use:indeterminate={someLoadedSelected}');
		expect(source).toContain('aria-label="Select all loaded issues"');
	});

	test('read-only viewers get no checkboxes or bulk bar', () => {
		expect(source).toContain('{#if mayWrite}');
		expect(source).toContain('<BulkActionBar');
		expect(source).toContain('{mayWrite}');
	});
});

describe('IssueTable title line', () => {
	test('keeps labels in the title flow instead of wrapping them to a new line', () => {
		expect(source).toContain('{@const labels = inlineLabels(labelsOf(issue))}');
		expect(source).toContain('class="d-flex align-items-center gap-2"');
		expect(source).toContain('class="d-inline-flex align-items-center gap-1 flex-shrink-0"');
		expect(source).not.toContain('class="d-flex flex-wrap align-items-center gap-2"');
		expect(source).toContain('+{labels.overflow}');
	});

	test('the mobile metadata line still exists below md', () => {
		expect(source).toContain('small text-body-secondary d-md-none mt-1 text-break');
	});
});

describe('IssueTable responsive columns', () => {
	const columns = [...source.matchAll(/<th scope="col"[\s\S]*?<\/th>/g)].map((match) =>
		match[0].replace(/\s+/g, ' ')
	);

	function column(label: string): string {
		const found = columns.find((entry) => entry.includes(`>${label}</th>`));
		if (!found) throw new Error(`missing ${label} column`);
		return found;
	}

	test('the title column has no fixed width', () => {
		expect(column('Title')).not.toContain('width:');
	});

	test('secondary metadata waits for wider screens', () => {
		expect(column('Planned')).toContain('d-none d-xl-table-cell');
		expect(column('Assignee')).toContain('d-none d-lg-table-cell');
		expect(column('Updated')).toContain('d-none d-lg-table-cell');
	});

	test('the tablet row keeps Issue, Status and Priority beside the title', () => {
		for (const label of ['Issue', 'Status', 'Priority']) {
			expect(column(label)).toContain('d-none d-md-table-cell');
		}
	});

	test('every column keeps one responsive header', () => {
		// The loading skeleton and the loaded table each render the eight
		// headers: select, issue, title, status, priority, planned, assignee,
		// updated.
		expect(columns).toHaveLength(16);
		expect(source.match(/class="small d-none d-xl-table-cell"/g)).toHaveLength(1);
		expect(source.match(/class="small d-none d-lg-table-cell"/g)).toHaveLength(1);
	});
});
