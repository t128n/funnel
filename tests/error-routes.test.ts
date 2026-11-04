import { describe, expect, test } from 'bun:test';
import { GET } from '#/routes/api/[...rest]/+server';
import { load as loadEpic } from '#/routes/(app)/epics/[owner]/[repo]/[number]/+page.server';
import { load as loadIssue } from '#/routes/(app)/issues/[owner]/[repo]/[number]/+page.server';
import { load as loadSubmission } from '#/routes/(app)/inbox/submission/[id]/+page.server';
import { load as loadMilestone } from '#/routes/(app)/milestones/[owner]/[repo]/[number]/+page.server';

/**
 * The catch-all under `/api` guarantees a JSON 404 for unknown endpoints, so an
 * API client that sends `Accept: text/html` never receives the HTML error page.
 */
describe('api catch-all', () => {
	test('answers unknown paths with a JSON 404', async () => {
		const response = await GET({} as never);
		expect(response.status).toBe(404);
		expect(response.headers.get('content-type')).toContain('application/json');
		expect(await response.json()).toEqual({ message: 'Not found' });
	});
});

/** Resolve the status of a load that rejects with a SvelteKit HttpError. */
async function rejectionStatus(run: () => Promise<unknown>): Promise<number | undefined> {
	try {
		await run();
		return undefined;
	} catch (error) {
		return (error as { status?: number }).status;
	}
}

/**
 * Missing entities are real route 404s. Each one is rendered by the nested
 * `(app)` error boundary, which keeps the navbar and maps the section to its
 * own plain-language copy and recovery list.
 */
describe('missing-entity routes', () => {
	test('an unknown repository or milestone is a 404', async () => {
		const params = { owner: 'demo', repo: 'missing', number: '999' };
		expect(await rejectionStatus(() => loadMilestone({ params } as never))).toBe(404);
	});

	test('an unknown epic is a 404', async () => {
		const params = { owner: 'demo', repo: 'funnel', number: '999' };
		expect(await rejectionStatus(() => loadEpic({ params } as never))).toBe(404);
	});

	test('a missing inbox submission is a 404', async () => {
		const params = { id: 'not-staged' };
		const parent = async () => ({ inbox: { entries: [] } });
		expect(
			await rejectionStatus(() => loadSubmission({ params, parent } as never)),
		).toBe(404);
	});

	test('a malformed issue URL is a 404 instead of a 200 placeholder', async () => {
		const params = { owner: 'demo', repo: 'funnel', number: 'not-a-number' };
		expect(await rejectionStatus(async () => loadIssue({ params } as never))).toBe(404);
	});
});
