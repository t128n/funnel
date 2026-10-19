import { describe, expect, test } from 'bun:test';
import { APP_NAME, pageTitle } from './seo';

describe('pageTitle', () => {
	test('appends the app name', () => {
		expect(pageTitle('Issues')).toBe(`Issues · ${APP_NAME}`);
	});

	test('joins multiple parts with a middle dot', () => {
		expect(pageTitle('Repositories', 'Settings')).toBe(
			`Repositories · Settings · ${APP_NAME}`,
		);
	});

	test('does not duplicate a trailing app name', () => {
		expect(pageTitle('Funnel')).toBe(APP_NAME);
	});

	test('ignores empty and whitespace parts', () => {
		expect(pageTitle(undefined, '  ', null, 'Inbox')).toBe(
			`Inbox · ${APP_NAME}`,
		);
	});

	test('falls back to the app name with no parts', () => {
		expect(pageTitle()).toBe(APP_NAME);
	});
});
