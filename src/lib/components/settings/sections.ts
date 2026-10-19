/**
 * Settings-section catalog.
 *
 * Single source for the `/settings` navigation: the desktop sidebar, the mobile
 * `NativeSelect` switcher, and the active-section lookup all read this, so
 * labels, icons, and hrefs cannot drift. Declarations only — no data loading —
 * so the shell stays thin.
 */
import BotIcon from '@lucide/svelte/icons/bot';
import CircleUserIcon from '@lucide/svelte/icons/circle-user';
import FlagIcon from '@lucide/svelte/icons/flag';
import FolderGit2Icon from '@lucide/svelte/icons/folder-git-2';
import InboxIcon from '@lucide/svelte/icons/inbox';
import KanbanIcon from '@lucide/svelte/icons/kanban';
import PaintbrushIcon from '@lucide/svelte/icons/paintbrush';
import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
import TagIcon from '@lucide/svelte/icons/tag';
import TimerIcon from '@lucide/svelte/icons/timer';
import UsersIcon from '@lucide/svelte/icons/users';
import type { Role } from '#lib/roles';

export interface SettingsSection {
	/** Stable id, also the final path segment (except `overview`). */
	id: string;
	label: string;
	href: string;
	/** Minimum RBAC role required to see and open the section. */
	minRole: Role;
	// Lucide icon components are not typed as `Component` yet.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	icon: any;
}

/** A scoped block of sections, rendered under one sidebar heading. */
export interface SettingsGroup {
	/** Stable id, used for keying. */
	id: string;
	/** Section heading; omitted for the unlabeled personal block. */
	label?: string;
	sections: SettingsSection[];
}

/**
 * The `fail(...)` shape the `/settings/*` save actions return, shared by the
 * pages and the form component that renders the errors.
 */
export interface SettingsFormResult {
	message?: string;
	issues?: string[];
}

/**
 * Scoped like the cockpit sidebar: personal experience first, then the
 * workspace the instance tracks, then the background plumbing.
 */
export const settingsGroups: SettingsGroup[] = [
	{
		id: 'personal',
		sections: [
			{ id: 'overview', label: 'Account', href: '/settings', minRole: 'read', icon: CircleUserIcon },
			{ id: 'appearance', label: 'Appearance', href: '/settings/appearance', minRole: 'read', icon: PaintbrushIcon },
			{ id: 'features', label: 'Features', href: '/settings/features', minRole: 'read', icon: FlagIcon }
		]
	},
	{
		id: 'workspace',
		label: 'Workspace',
		sections: [
			{
				id: 'repositories',
				label: 'Repositories',
				href: '/settings/repositories',
				minRole: 'admin',
				icon: FolderGit2Icon
			},
			{ id: 'projects', label: 'Projects', href: '/settings/projects', minRole: 'admin', icon: TagIcon },
			{ id: 'intake', label: 'Intake', href: '/settings/intake', minRole: 'admin', icon: InboxIcon },
			{ id: 'board', label: 'Board', href: '/settings/board', minRole: 'admin', icon: KanbanIcon }
		]
	},
	{
		id: 'system',
		label: 'System',
		sections: [
			{ id: 'people', label: 'People', href: '/settings/people', minRole: 'admin', icon: UsersIcon },
			{ id: 'github-app', label: 'GitHub App', href: '/settings/github-app', minRole: 'admin', icon: BotIcon },
			{ id: 'sync', label: 'Sync', href: '/settings/sync', minRole: 'admin', icon: RefreshCwIcon },
			{ id: 'session', label: 'Session', href: '/settings/session', minRole: 'admin', icon: TimerIcon }
		]
	}
];

