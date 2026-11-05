/**
 * Settings-section catalog.
 *
 * Single source for the `/settings` navigation: the desktop sidebar, the mobile
 * section switcher, and the active-section lookup all read this, so labels and
 * hrefs cannot drift. Declarations only — no data loading — so the shell stays
 * thin.
 */
import type { Role } from '#lib/roles';

export interface SettingsSection {
	/** Stable id, also the final path segment (except `overview`). */
	id: string;
	label: string;
	/** Sentence-case line under the page h1. */
	description: string;
	href: string;
	/** Minimum RBAC role required to see and open the section. */
	minRole: Role;
}

/** A scoped block of sections, rendered under one sidebar heading. */
export interface SettingsGroup {
	/** Stable id, used for keying. */
	id: string;
	/** Group heading in the desktop nav; sentence case. */
	label: string;
	sections: SettingsSection[];
}

export type { SettingsFormResult, SettingsIssue } from '#lib/settings-feedback';

/**
 * Scoped like the cockpit sidebar: personal experience first, then the
 * workspace the instance tracks, then the background plumbing.
 */
export const settingsGroups: SettingsGroup[] = [
	{
		id: 'personal',
		label: 'Personal',
		sections: [
			{
				id: 'overview',
				label: 'Account',
				description: 'Your profile and how you sign in to Funnel.',
				href: '/settings',
				minRole: 'read'
			},
			{
				id: 'appearance',
				label: 'Appearance',
				description: '',
				href: '/settings/appearance',
				minRole: 'read'
			},
			{
				id: 'features',
				label: 'Features',
				description: 'Enable or disable functionality for this browser.',
				href: '/settings/features',
				minRole: 'read'
			}
		]
	},
	{
		id: 'workspace',
		label: 'Workspace',
		sections: [
			{
				id: 'repositories',
				label: 'Repositories',
				description: 'Repositories Funnel mirrors and can create issues in.',
				href: '/settings/repositories',
				minRole: 'admin'
			},
			{
				id: 'projects',
				label: 'Projects',
				description: 'GitHub labels that mark an issue as belonging to a project.',
				href: '/settings/projects',
				minRole: 'admin'
			},
			{
				id: 'labels',
				label: 'Labels',
				description: 'Namespace Funnel’s reserved labels with a global prefix.',
				href: '/settings/labels',
				minRole: 'admin'
			},
			{
				id: 'intake',
				label: 'Intake',
				description: 'Where accepted submissions go by default.',
				href: '/settings/intake',
				minRole: 'admin'
			},
			{
				id: 'board',
				label: 'Board',
				description: 'Done-column retention and per-stage work-in-progress limits.',
				href: '/settings/board',
				minRole: 'admin'
			},
			{
				id: 'planning',
				label: 'Planning',
				description: 'Size-to-time estimates, the allocation, and maintainer capacity.',
				href: '/settings/planning',
				minRole: 'admin'
			},
			{
				id: 'notifications',
				label: 'Notifications',
				description: 'Which notification channels the instance uses.',
				href: '/settings/notifications',
				minRole: 'admin'
			}
		]
	},
	{
		id: 'system',
		label: 'System',
		sections: [
			{
				id: 'people',
				label: 'People',
				description: 'Who can use this instance and what each role can do.',
				href: '/settings/people',
				minRole: 'admin'
			},
			{
				id: 'github-app',
				label: 'GitHub App',
				description: 'The App Funnel created and uses to mirror issues and post writes.',
				href: '/settings/github-app',
				minRole: 'admin'
			},
			{
				id: 'sync',
				label: 'Sync',
				description: 'How often Funnel polls GitHub for changes.',
				href: '/settings/sync',
				minRole: 'admin'
			},
			{
				id: 'session',
				label: 'Session',
				description: 'How long a signed-in session lasts.',
				href: '/settings/session',
				minRole: 'admin'
			}
		]
	}
];
