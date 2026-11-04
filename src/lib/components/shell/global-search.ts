/**
 * Global search contract for the navbar panel.
 *
 * The panel is deliberately thin: it reuses the issues feed with no repository
 * filter, so results span every mirrored repository and the existing feed's
 * pagination/visibility rules stay authoritative. Identifier and qualifier
 * search is #21, not this surface.
 */

export const GLOBAL_SEARCH_LIMIT = 8;

export const GLOBAL_SEARCH_PLACEHOLDER = 'Search title, body, or comments';

/** `/api/feeds/issues` with a trimmed query, never a repository scope. */
export function globalSearchUrl(query: string, limit = GLOBAL_SEARCH_LIMIT): string {
	const params = new URLSearchParams({ limit: String(limit) });
	const trimmed = query.trim();
	if (trimmed.length > 0) params.set('q', trimmed);
	return `/api/feeds/issues?${params.toString()}`;
}
