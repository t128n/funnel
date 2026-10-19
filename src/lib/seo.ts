/**
 * Document metadata helpers.
 *
 * One place to compose `<title>` strings and hold the app-wide defaults, so
 * every route reads the same and the "· Funnel" suffix can never drift. Pure
 * and dependency-free: used by `PageHead.svelte`, `+error.svelte`, and tests.
 */

/** The product name, also the default `<title>` suffix. */
export const APP_NAME = 'Funnel';

/** Default `<meta name="description">` for pages that don't set one. */
export const DEFAULT_DESCRIPTION =
	'Funnel is a focused triage and delivery cockpit for GitHub issues.';

/**
 * Join the non-empty parts with " · " and append {@link APP_NAME} unless it is
 * already the final part. `pageTitle("Issues")` → `"Issues · Funnel"`.
 */
export function pageTitle(...parts: Array<string | undefined | null>): string {
	const clean = parts
		.map((part) => part?.trim())
		.filter((part): part is string => Boolean(part));
	if (clean.length === 0 || clean[clean.length - 1] !== APP_NAME) {
		clean.push(APP_NAME);
	}
	return clean.join(' · ');
}
