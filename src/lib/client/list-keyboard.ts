/**
 * Keyboard contract shared by the Issue and Inbox tables.
 *
 * The tables keep their existing row links and click behaviour. This module
 * only decides what a key press means; the components own focus movement,
 * bulk selection, and the status/quick-create controls. Keeping the decision
 * pure makes the input guards and boundary rules testable without a DOM.
 */

/** Keys the list surfaces understand. */
export type ListMoveTarget = 'next' | 'previous' | 'first' | 'last';

export type ListKeyAction =
	| { type: 'move'; to: ListMoveTarget }
	| { type: 'open' }
	| { type: 'toggle' }
	| { type: 'status' }
	| { type: 'create' }
	| { type: 'dismiss' };

export interface ListKeyOptions {
	/** Read-only viewers cannot select rows, change status, or create. */
	mayWrite: boolean;
}

const TYPING_SELECTOR =
	'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]), textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';

/**
 * Whether the event originates from a field that owns its own keys.
 *
 * Bare list shortcuts must never steal typing (including `j`, `k`, `x`, and
 * `Escape` from a native select). Modifier combinations are ignored too, so a
 * browser or app shortcut keeps precedence.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
	const element = target as (Element & { closest?: unknown }) | null;
	if (!element || typeof element.closest !== 'function') return false;
	return (element as Element).closest(TYPING_SELECTOR) !== null;
}

/** Resolve one key press for a table row, or `null` when it is not ours. */
export function listKeyAction(
	event: Pick<KeyboardEvent, 'key' | 'target' | 'defaultPrevented' | 'ctrlKey' | 'metaKey' | 'altKey'>,
	options: ListKeyOptions
): ListKeyAction | null {
	if (event.defaultPrevented) return null;
	if (event.ctrlKey || event.metaKey || event.altKey) return null;
	if (isTypingTarget(event.target)) return null;

	switch (event.key) {
		case 'j':
		case 'ArrowDown':
			return { type: 'move', to: 'next' };
		case 'k':
		case 'ArrowUp':
			return { type: 'move', to: 'previous' };
		case 'Home':
			return { type: 'move', to: 'first' };
		case 'End':
			return { type: 'move', to: 'last' };
		case 'Enter':
			return { type: 'open' };
		case 'x':
		case 'X':
			return options.mayWrite ? { type: 'toggle' } : null;
		case 's':
		case 'S':
			return options.mayWrite ? { type: 'status' } : null;
		case 'c':
		case 'C':
			return options.mayWrite ? { type: 'create' } : null;
		case 'Escape':
			return { type: 'dismiss' };
		default:
			return null;
	}
}

/**
 * Clamp a roving row index. The ends are hard stops rather than a wrap, which
 * matches table reading order and keeps `k` at the first row stationary.
 * `-1` means "no row focused yet": next enters at the first row and previous
 * enters at the last.
 */
export function nextListIndex(
	to: ListMoveTarget,
	current: number,
	count: number
): number | null {
	if (count <= 0) return null;
	const at = current >= 0 && current < count ? current : -1;

	switch (to) {
		case 'next':
			return at < 0 ? 0 : Math.min(at + 1, count - 1);
		case 'previous':
			return at < 0 ? count - 1 : Math.max(at - 1, 0);
		case 'first':
			return 0;
		case 'last':
			return count - 1;
		default:
			return null;
	}
}

/** Screen-reader text for a row focus change. */
export function listRowAnnouncement(index: number, count: number, label: string): string {
	const position = `Row ${index + 1} of ${count}`;
	return label.trim() ? `${position}: ${label.trim()}` : position;
}
