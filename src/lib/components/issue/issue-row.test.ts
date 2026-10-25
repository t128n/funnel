import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

/**
 * `isStruckThrough` lives in `IssueRow.svelte`'s module script (it is the
 * row's only visual-state logic, so it sits next to the markup). Bun has no
 * Svelte loader, so extract that module script, transpile the TypeScript and
 * evaluate it in isolation: the helper is pure and imports nothing.
 */
const source = readFileSync(new URL('./IssueRow.svelte', import.meta.url), 'utf8');
const moduleSource = source.match(/<script\s+module[^>]*>([\s\S]*?)<\/script>/)?.[1];

if (!moduleSource) {
	throw new Error('IssueRow.svelte must export isStruckThrough from a <script module> block');
}

const moduleJs = new Bun.Transpiler({ loader: 'ts' }).transformSync(moduleSource);
const moduleUrl = `data:text/javascript;base64,${Buffer.from(moduleJs).toString('base64')}`;
const { isStruckThrough } = (await import(moduleUrl)) as {
	isStruckThrough: (state: string) => boolean;
};

describe('isStruckThrough', () => {
	test('closed rows are struck through', () => {
		expect(isStruckThrough('closed')).toBe(true);
	});

	test('open and unknown states stay readable', () => {
		expect(isStruckThrough('open')).toBe(false);
		expect(isStruckThrough('CLOSED')).toBe(false);
		expect(isStruckThrough('')).toBe(false);
	});
});
