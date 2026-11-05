/**
 * Command definitions for the one Mod+K palette.
 *
 * Commands are plain data so the palette's filtering and selection rules stay
 * testable without mounting Svelte. The palette renders these beside the live
 * issue search results; navigation commands only ever move the router, and the
 * single write command opens the existing quick-create dialog.
 */
import { savedViewUrl, type SavedView } from '#lib/saved-views';
import { ALL_NAV } from './navigation';

export type PaletteCommandGroup = 'Navigate' | 'Create' | 'Saved views';

/** A runnable entry in the palette. */
export interface PaletteCommand {
	id: string;
	label: string;
	group: PaletteCommandGroup;
	icon: string;
	/** Extra searchable words beyond the label and group. */
	keywords: string[];
	/** Internal route (navigation and saved views). */
	href?: string;
	/** Palette-only action; the shell owns the callback. */
	action?: 'create-issue';
	/** Only writers may see or run this command. */
	requiresWrite?: boolean;
}

export interface PaletteCommandOptions {
	mayWrite: boolean;
	/** Views visible to the signed-in user; read-only viewers may still open them. */
	savedViews?: SavedView[];
}

/** The static destinations every signed-in viewer may reach. */
const APP_COMMANDS: readonly PaletteCommand[] = [
	...ALL_NAV.map((destination) => ({
		id: `nav:${destination.href}`,
		label: destination.label,
		group: 'Navigate' as const,
		icon: destination.icon,
		keywords: ['go', 'open', 'navigate'],
		href: destination.href
	})),
	{
		id: 'nav:settings',
		label: 'Settings',
		group: 'Navigate',
		icon: 'bi-gear',
		keywords: ['preferences', 'configuration', 'admin'],
		href: '/settings'
	},
	{
		id: 'nav:notifications',
		label: 'Notifications',
		group: 'Navigate',
		icon: 'bi-bell',
		keywords: ['mentions', 'unread', 'activity'],
		href: '/notifications'
	}
];

/**
 * Build the palette's command list for the current viewer.
 *
 * Write-only entries are removed here rather than disabled/hidden in markup,
 * so a read-only viewer cannot reach them by keyboard, click, or a stale
 * filtered list. Opening an existing saved view is a read, not a write.
 */
export function buildPaletteCommands({
	mayWrite,
	savedViews = []
}: PaletteCommandOptions): PaletteCommand[] {
	const commands: PaletteCommand[] = APP_COMMANDS.map((command) => ({ ...command }));

	if (mayWrite) {
		commands.push({
			id: 'action:create-issue',
			label: 'Create issue',
			group: 'Create',
			icon: 'bi-plus-lg',
			keywords: ['new', 'compose', 'quick create'],
			action: 'create-issue',
			requiresWrite: true
		});
	}

	const views = savedViews
		.map(
			(view): PaletteCommand => ({
				id: `view:${view.id}`,
				label: view.name,
				group: 'Saved views',
				icon: 'bi-bookmark-star',
				keywords: [view.scope, 'saved view', 'filter', view.query],
				href: savedViewUrl(view)
			})
		)
		.sort((left, right) => left.label.localeCompare(right.label));

	return [...commands, ...views];
}

/** Lower-cased haystack used by {@link filterPaletteCommands}. */
function searchText(command: PaletteCommand): string {
	return [command.label, command.group, ...command.keywords].join(' ').toLowerCase();
}

/**
 * Keep commands matching every whitespace-separated term. An empty query
 * keeps the full list, so the palette doubles as a command directory before
 * the reader types.
 */
export function filterPaletteCommands(
	commands: readonly PaletteCommand[],
	query: string
): PaletteCommand[] {
	const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	if (terms.length === 0) return commands.slice();
	return commands.filter((command) => {
		const text = searchText(command);
		return terms.every((term) => text.includes(term));
	});
}

/**
 * Next palette item for a navigation key, wrapping at the edges.
 *
 * `current` is the focused item index, or `-1` when focus is still in the
 * input. Returns `null` for other keys and for an empty list.
 */
export function paletteFocusIndex(
	key: string,
	current: number,
	count: number
): number | null {
	if (count <= 0) return null;
	const at = current >= 0 && current < count ? current : -1;

	switch (key) {
		case 'ArrowDown':
			return at < 0 ? 0 : (at + 1) % count;
		case 'ArrowUp':
			return at < 0 ? count - 1 : (at - 1 + count) % count;
		case 'Home':
			return 0;
		case 'End':
			return count - 1;
		default:
			return null;
	}
}
