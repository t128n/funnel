import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

/**
 * Inbox table contracts (Composition A §9).
 *
 * Bun has no Svelte loader, so the row-label helpers are transpiled out of the
 * component's module script and evaluated in isolation; the table shape and
 * the triage wiring are checked by source read, the same way `issue-row.test`
 * checks its row.
 */
const source = readFileSync(new URL('./InboxTable.svelte', import.meta.url), 'utf8');
const moduleSource = source.match(/<script\s+module[^>]*>([\s\S]*?)<\/script>/)?.[1];

if (!moduleSource) {
	throw new Error('InboxTable.svelte must export its row labels from a <script module> block');
}

const moduleJs = new Bun.Transpiler({ loader: 'ts' }).transformSync(moduleSource);
const moduleUrl = `data:text/javascript;base64,${Buffer.from(moduleJs).toString('base64')}`;
const { submissionRepoLabel, submissionSource, submissionTitle } = (await import(
	moduleUrl
)) as {
	submissionRepoLabel: (repo: string) => string;
	submissionSource: (source: string | null) => string;
	submissionTitle: (title: string) => string;
};

/** The visible header labels, in document order. */
const headers = [...source.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((match) =>
	match[1].replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim()
);

describe('Inbox table columns', () => {
	test('renders the six approved columns in order', () => {
		expect(headers).toEqual([
			'Issue',
			'Title',
			'Repository',
			'Source',
			'Submitted',
			'Triage'
		]);
	});

	test('hides Issue/Source/Submitted below md and Repository below lg', () => {
		expect(source).toMatch(
			/<th\b[^>]*class="[^"]*d-none d-md-table-cell[^"]*"[^>]*>\s*Issue\s*<\/th>/
		);
		expect(source).toMatch(
			/<th\b[^>]*class="[^"]*d-none d-md-table-cell[^"]*"[^>]*>\s*Source\s*<\/th>/
		);
		expect(source).toMatch(
			/<th\b[^>]*class="[^"]*d-none d-md-table-cell[^"]*"[^>]*>\s*Submitted\s*<\/th>/
		);
		expect(source).toMatch(
			/<th\b[^>]*class="[^"]*d-none d-lg-table-cell[^"]*"[^>]*>\s*Repository\s*<\/th>/
		);
	});

	test('keeps the mobile ID and metadata lines', () => {
		expect(source).toContain('d-md-none d-block mb-1');
		expect(source).toContain('d-md-none mt-1');
	});
});

describe('Inbox table triage', () => {
	test('submissions accept and decline through the existing form actions', () => {
		expect(source).toContain('?/accept');
		expect(source).toContain('?/dismiss');
		expect(source).toContain('use:enhance');
	});

	test('issues triage through the status select and the shared mutation path', () => {
		expect(source).toContain('type="select"');
		expect(source).toContain('STATUS_OPTIONS');
		expect(source).toContain('updateIssue(issue.repo, issue.number, { status })');
		expect(source).toContain('overlayKey(issue.repo, issue.number)');
	});

	test('title cells are real links to the dedicated pages', () => {
		expect(source).toContain('href={submissionPath(submission.id)}');
		expect(source).toContain("href={issuePath('issues', issue.repo, issue.number)}");
	});
});

describe('submission row labels', () => {
	test('source falls back to Intake and is trimmed', () => {
		expect(submissionSource(null)).toBe('Intake');
		expect(submissionSource('   ')).toBe('Intake');
		expect(submissionSource(' Email ')).toBe('Email');
	});

	test('repository falls back to an em dash', () => {
		expect(submissionRepoLabel('')).toBe('—');
		expect(submissionRepoLabel('  ')).toBe('—');
		expect(submissionRepoLabel('t128n/funnel')).toBe('t128n/funnel');
	});

	test('title falls back to a readable placeholder', () => {
		expect(submissionTitle('')).toBe('Untitled submission');
		expect(submissionTitle('  ')).toBe('Untitled submission');
		expect(submissionTitle('  Fix the dates ')).toBe('Fix the dates');
	});
});
