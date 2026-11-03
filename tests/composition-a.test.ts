import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');

function source(path: string): string {
	return readFileSync(join(root, path), 'utf8');
}

function walk(dir: string, files: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) walk(path, files);
		else if (/\.(svelte|ts)$/.test(entry)) files.push(path);
	}
	return files;
}

const appRoutes = walk(join(root, 'src/routes/(app)'));
const components = walk(join(root, 'src/lib/components'));
const navigation = source('src/lib/components/shell/navigation.ts');
const appBar = source('src/lib/components/shell/AppBar.svelte');
const shell = source('src/lib/components/shell/AppShell.svelte');

describe('Composition A shell', () => {
	test('has one global navigation layer and no sidebar or split pane', () => {
		expect(() => source('src/lib/components/shell/SidebarNav.svelte')).toThrow();
		expect(() => source('src/lib/components/shell/SplitView.svelte')).toThrow();
		expect(() => source('src/lib/components/detail/DetailShell.svelte')).toThrow();

		const offenders = components.filter((file) =>
			/split-view|app-sidebar|sidebar-heading|app-shell__body/.test(readFileSync(file, 'utf8'))
		);
		expect(offenders).toEqual([]);
	});

	test('every destination remains reachable from the navbar catalog', () => {
		const destinations = [
			'/inbox',
			'/issues',
			'/board',
			'/matrix',
			'/plan',
			'/timeline',
			'/issues?assignee=me',
			'/attention',
			'/epics',
			'/milestones'
		];
		for (const href of destinations) {
			expect(navigation).toContain(`href: '${href}'`);
		}
		// Settings and Notifications stay reachable as navbar controls.
		expect(appBar).toContain('href="/notifications"');
		expect(appBar).toContain("openSettings('/settings')");
	});

	test('keeps the primary text set at six and overflows the rest', () => {
		const primary = navigation.slice(
			navigation.indexOf('export const PRIMARY_NAV'),
			navigation.indexOf('export const OVERFLOW_NAV')
		);
		const links = primary.match(/label: '/g) ?? [];
		expect(links.length).toBeLessThanOrEqual(6);
		expect(primary).toContain("label: 'Timeline'");
		const overflow = navigation.slice(navigation.indexOf('export const OVERFLOW_NAV'));
		expect(overflow).toContain("label: 'My Issues'");
		expect(overflow).toContain("label: 'Attention'");
	});

	test('marks the active destination with aria-current', () => {
		expect(appBar).toContain('aria-current={isNavActive');
		expect(appBar).toContain('Navbar');
		expect(appBar).toContain('Collapse');
		expect(shell).toContain('Skip to main content');
	});

	test('renders pages in normal document flow with Bootstrap containers', () => {
		const containers = appRoutes.map((file) => readFileSync(file, 'utf8'));
		expect(containers.some((text) => text.includes('container-xl py-4'))).toBe(true);
		expect(containers.some((text) => text.includes('container-lg py-4'))).toBe(true);
		expect(shell).not.toContain('100svh');
		expect(shell).not.toContain('app-sidebar');
	});
});

describe('Composition A pages', () => {
	test('issues index is a grouped seven-column table with a one-row toolbar', () => {
		const page = source('src/routes/(app)/issues/+page.svelte');
		const table = source('src/lib/components/issue/IssueTable.svelte');

		expect(page).toContain('container-xl py-4');
		expect(page).toContain('row g-2');
		expect(page).toContain('col-12 col-lg-4');
		expect(page).not.toContain('SplitView');
		expect(page).not.toContain('Toolbar'); // the strict one-row grid is explicit

		for (const column of ['Issue', 'Title', 'Status', 'Priority', 'Planned', 'Assignee', 'Updated']) {
			expect(table).toContain(column);
		}
		expect(table).toContain('table-responsive border rounded');
		expect(table).toContain('colspan="7"');
		expect(table).toContain('issuePath(\'issues\'');
		expect(table).toContain('d-md-none');
	});

	test('issue detail is a dedicated 8/4 document with Properties and Details', () => {
		const route = source('src/routes/(app)/issues/[owner]/[repo]/[number]/+page.svelte');
		const page = source('src/lib/components/issue/IssueDetailPage.svelte');
		const properties = source('src/lib/components/issue/IssuePropertiesCard.svelte');
		const details = source('src/lib/components/issue/IssueDetailsCard.svelte');

		expect(route).toContain('container-lg py-4');
		expect(page).toContain('Breadcrumb');
		expect(page).toContain('col-lg-8');
		expect(page).toContain('col-lg-4');
		expect(page).toContain('IssuePropertiesCard');
		expect(page).toContain('IssueDetailsCard');
		expect(page).not.toContain('DetailShell');
		expect(page).not.toContain('onclose');

		for (const field of ['Status', 'Priority', 'Assignee', 'Milestone', 'Size']) {
			expect(properties).toContain(field);
		}
		for (const field of ['Repository', 'Epic', 'Opened', 'Updated']) {
			expect(details).toContain(field);
		}
	});

	test('inbox is a conventional table with inline triage', () => {
		const page = source('src/routes/(app)/inbox/+page.svelte');
		const table = source('src/lib/components/inbox/InboxTable.svelte');

		expect(page).toContain('container-xl py-4');
		expect(page).not.toContain('SplitView');
		for (const column of [
			'Issue',
			'Title',
			'Repository',
			'Source',
			'Submitted',
			'Triage'
		]) {
			expect(table).toContain(column);
		}
		expect(table).toContain('Accept');
		expect(table).toContain('Decline');
		expect(table).toContain('triageIssue');
	});

	test('the obsolete presentation infrastructure is gone', () => {
		const css = source('src/lib/styles/app.css');
		expect(css).not.toContain('app-sidebar');
		expect(css).not.toContain('split-view');
		expect(css).not.toContain('sidebar-heading');
		expect(css).toContain('.issue-document');
	});
});
