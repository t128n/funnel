/**
 * Issue list grouping preferences (group key + collapsed sections).
 *
 * Mirrors the theme controller: module-level runes for reactivity, persisted to
 * `localStorage` under the `funnel:` namespace, and safe to import on the
 * server (reads fall back to defaults before hydration).
 */
import type { GroupKey } from '#lib/components/issue/grouping';

const GROUP_KEY = 'funnel:issue-group';
const COLLAPSED_KEY = 'funnel:issue-collapsed';

const GROUP_VALUES: readonly GroupKey[] = ['none', 'status', 'priority', 'project', 'repo', 'milestone'];

function isBrowser(): boolean {
	return typeof window !== 'undefined';
}

function readGroup(): GroupKey {
	if (!isBrowser()) return 'status';
	const value = window.localStorage.getItem(GROUP_KEY);
	return GROUP_VALUES.includes(value as GroupKey) ? (value as GroupKey) : 'status';
}

function readCollapsed(): string[] {
	if (!isBrowser()) return [];
	try {
		const raw = window.localStorage.getItem(COLLAPSED_KEY);
		const parsed: unknown = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
	} catch {
		return [];
	}
}

function persist(key: string, value: string): void {
	if (!isBrowser()) return;
	try {
		window.localStorage.setItem(key, value);
	} catch {
		// Private-mode / storage-disabled: the in-memory choice still applies.
	}
}

let group = $state<GroupKey>(readGroup());
let collapsed = $state<string[]>(readCollapsed());

/** The active grouping dimension. */
export function getGroupBy(): GroupKey {
	return group;
}

/** Switch grouping and persist the choice. */
export function setGroupBy(next: GroupKey): void {
	group = next;
	persist(GROUP_KEY, next);
}

/** Whether a section (keyed by `${groupBy}:${groupKey}`) is collapsed. */
export function isGroupCollapsed(key: string): boolean {
	return collapsed.includes(key);
}

/** Toggle a section open/closed and persist the set. */
export function toggleGroup(key: string): void {
	collapsed = collapsed.includes(key)
		? collapsed.filter((entry) => entry !== key)
		: [...collapsed, key];
	persist(COLLAPSED_KEY, JSON.stringify(collapsed));
}
