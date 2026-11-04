/**
 * Presentation helpers for the planner.
 *
 * Thin wrappers over the shared absolute date formatter so plan labels and
 * timestamps use one product-wide format.
 */

import { absoluteDate } from '#lib/time';

/** `2026-11-02` → `Week of 2 Nov 2026`. */
export function weekHeadline(week: string): string {
	const date = absoluteDate(week);
	if (date === week) return week;
	return `Week of ${date}`;
}
