/**
 * Sidebar section preferences.
 *
 * Mirrors `list-prefs`: module-level runes for reactivity, persisted to
 * `localStorage` under the `funnel:` namespace, and safe to import on the
 * server (reads fall back to defaults before hydration).
 */

const WORKSPACE_KEY = 'funnel:sidebar-workspace';

function isBrowser(): boolean {
	return typeof window !== 'undefined';
}

function readCollapsed(): boolean {
	if (!isBrowser()) return false;
	return window.localStorage.getItem(WORKSPACE_KEY) === '1';
}

function persist(value: boolean): void {
	if (!isBrowser()) return;
	try {
		window.localStorage.setItem(WORKSPACE_KEY, value ? '1' : '0');
	} catch {
		// Private-mode / storage-disabled: the in-memory choice still applies.
	}
}

let workspaceCollapsed = $state(readCollapsed());

/** Whether the Workspace section is collapsed. */
export function isWorkspaceCollapsed(): boolean {
	return workspaceCollapsed;
}

/** Toggle the Workspace section and persist the choice. */
export function toggleWorkspace(): void {
	workspaceCollapsed = !workspaceCollapsed;
	persist(workspaceCollapsed);
}
