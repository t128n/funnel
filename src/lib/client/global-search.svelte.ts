/**
 * Open state for the one global search surface.
 *
 * The navbar button and the Mod+K hotkey mutate this shared state, so both
 * entry points always open the same panel. The trigger is remembered so Escape
 * can return focus exactly where the user opened it.
 */

export const GLOBAL_SEARCH_TRIGGER_ID = 'global-search-trigger';

interface GlobalSearchState {
	open: boolean;
	trigger: HTMLElement | null;
}

export const globalSearch = $state<GlobalSearchState>({
	open: false,
	trigger: null
});

function triggerElement(): HTMLElement | null {
	if (typeof document === 'undefined') return null;
	return document.getElementById(GLOBAL_SEARCH_TRIGGER_ID);
}

export function openGlobalSearch(trigger?: HTMLElement | null): void {
	globalSearch.trigger = trigger ?? triggerElement() ?? globalSearch.trigger;
	globalSearch.open = true;
}

export function closeGlobalSearch(restoreFocus = true): void {
	globalSearch.open = false;
	if (!restoreFocus) return;
	const target = globalSearch.trigger ?? triggerElement();
	queueMicrotask(() => target?.focus());
}
