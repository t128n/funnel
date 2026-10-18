/**
 * Settings-section catalog.
 *
 * Single source for the `/settings` navigation: the desktop sidebar and the
 * mobile `NativeSelect` switcher both read this, so labels, icons, and hrefs
 * cannot drift. Declarations only — no data loading — so the shell stays thin.
 */
import FlagIcon from '@lucide/svelte/icons/flag';
import FolderGit2Icon from '@lucide/svelte/icons/folder-git-2';
import InboxIcon from '@lucide/svelte/icons/inbox';
import KanbanIcon from '@lucide/svelte/icons/kanban';
import PaintbrushIcon from '@lucide/svelte/icons/paintbrush';
import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
import TagIcon from '@lucide/svelte/icons/tag';
import TimerIcon from '@lucide/svelte/icons/timer';
import type { Component } from 'svelte';

export interface SettingsSection {
	/** Stable id, also the final path segment. */
	id: string;
	label: string;
	href: string;
	// Lucide icon components are not typed as `Component` yet.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	icon: any;
}

/**
 * The `fail(...)` shape the `/settings/*` save actions return, shared by the
 * pages and the form component that renders the errors.
 */
export interface SettingsFormResult {
	message?: string;
	issues?: string[];
}

export const settingsSections: SettingsSection[] = [
	{ id: 'appearance', label: 'Appearance', href: '/settings/appearance', icon: PaintbrushIcon },
	{ id: 'features', label: 'Features', href: '/settings/features', icon: FlagIcon },
	{
		id: 'repositories',
		label: 'Repositories',
		href: '/settings/repositories',
		icon: FolderGit2Icon
	},
	{ id: 'projects', label: 'Projects', href: '/settings/projects', icon: TagIcon },
	{ id: 'intake', label: 'Intake', href: '/settings/intake', icon: InboxIcon },
	{ id: 'sync', label: 'Sync', href: '/settings/sync', icon: RefreshCwIcon },
	{ id: 'board', label: 'Board', href: '/settings/board', icon: KanbanIcon },
	{ id: 'session', label: 'Session', href: '/settings/session', icon: TimerIcon }
];
