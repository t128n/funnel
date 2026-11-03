/**
 * Settings-section catalog.
 *
 * Single source for the `/settings` navigation: the desktop sidebar, the mobile
 * section switcher, and the active-section lookup all read this, so labels,
 * icons, and hrefs cannot drift. Declarations only — no data loading — so the
 * shell stays thin.
 *
 * Icons are Bootstrap Icon class names (`bi-*`), rendered as
 * `<i class="bi {section.icon}">` by the settings layout.
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
	/** Bootstrap Icon class name without the `bi` base class, e.g. `bi-bell`. */
	icon: string;
}

/** A scoped block of sections, rendered under one sidebar heading. */
export interface SettingsGroup {
	/** Stable id, used for keying. */
	id: string;
	/** Group heading in the desktop nav; sentence case. */
	label: string;
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
		label: 'Personal',
		sections: [
			{
				id: 'overview',
				label: 'Account',
				description: 'Your profile and how you sign in to Funnel.',
				href: '/settings',
				minRole: 'read',
				icon: 'bi-person-circle'
			},
			{
				id: 'appearance',
				label: 'Appearance',
				description: '',
				href: '/settings/appearance',
				minRole: 'read',
				icon: 'bi-palette'
			},
			{
				id: 'features',
				label: 'Features',
				description: 'Enable or disable functionality for this browser.',
				href: '/settings/features',
				minRole: 'read',
				icon: 'bi-flag'
			},
			{
				id: 'availability',
				label: 'Availability',
				description: 'Working hours, blocked windows, and a read-only calendar feed for the day planner.',
				href: '/settings/availability',
				minRole: 'read',
				icon: 'bi-calendar-event'
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
				minRole: 'admin',
				icon: 'bi-folder'
			},
			{
				id: 'projects',
				label: 'Projects',
				description: 'GitHub labels that mark an issue as belonging to a project.',
				href: '/settings/projects',
				minRole: 'admin',
				icon: 'bi-tag'
			},
			{
				id: 'intake',
				label: 'Intake',
				description: 'Where accepted submissions go by default.',
				href: '/settings/intake',
				minRole: 'admin',
				icon: 'bi-inbox'
			},
			{
				id: 'board',
				label: 'Board',
				description: 'Done-column retention and per-stage work-in-progress limits.',
				href: '/settings/board',
				minRole: 'admin',
				icon: 'bi-kanban'
			},
			{
				id: 'planning',
				label: 'Planning',
				description: 'Size-to-time estimates, the cycle shape, and planning capacity.',
				href: '/settings/planning',
				minRole: 'admin',
				icon: 'bi-calendar-range'
			},
			{
				id: 'notifications',
				label: 'Notifications',
				description: 'Which notification channels the instance uses.',
				href: '/settings/notifications',
				minRole: 'admin',
				icon: 'bi-bell'
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
				minRole: 'admin',
				icon: 'bi-people'
			},
			{
				id: 'github-app',
				label: 'GitHub App',
				description: 'The App Funnel created and uses to mirror issues and post writes.',
				href: '/settings/github-app',
				minRole: 'admin',
				icon: 'bi-robot'
			},
			{
				id: 'sync',
				label: 'Sync',
				description: 'How often Funnel polls GitHub for changes.',
				href: '/settings/sync',
				minRole: 'admin',
				icon: 'bi-arrow-clockwise'
			},
			{
				id: 'session',
				label: 'Session',
				description: 'How long a signed-in session lasts.',
				href: '/settings/session',
				minRole: 'admin',
				icon: 'bi-stopwatch'
			}
		]
	}
];
