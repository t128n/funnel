<script lang="ts">
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import { cn } from '#lib/utils.js';

	/**
	 * One sidebar destination: a plain text link and an optional count.
	 *
	 * Bugzilla chrome carries no icons. The active item is weight + colour + a
	 * 3px left rule (styled by `Sidebar.MenuButton`), never a filled row. Counts
	 * are plain `(3)` text in `--muted-foreground`, never a pill or badge.
	 *
	 * In the icon rail the label is replaced by a one-letter monogram so the
	 * collapsed sidebar stays scannable; the tooltip still names the item.
	 */
	interface Props {
		href: string;
		label: string;
		/** Accepted for the settings nav, which still passes one; never rendered. */
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		icon?: any;
		active?: boolean;
		/** Count rendered as plain `(3)`; hidden when zero or absent. */
		badge?: number;
		/** Accepted for callers; counts are always muted text. */
		tone?: 'neutral' | 'destructive';
		class?: string;
	}

	let {
		href,
		label,
		icon: _icon,
		active = false,
		badge = 0,
		tone: _tone = 'neutral',
		class: className
	}: Props = $props();

	const monogram = $derived(label.slice(0, 1).toUpperCase() || '?');
</script>

<Sidebar.MenuItem>
	<Sidebar.MenuButton isActive={active} tooltipContent={label} class={cn('ps-2', className)}>
		{#snippet child({ props })}
			<a href={href} aria-current={active ? 'page' : undefined} {...props}>
				<span class="group-data-[collapsible=icon]:hidden truncate">{label}</span>
				<span
					aria-hidden="true"
					class="group-data-[collapsible=icon]:inline-flex hidden justify-center text-xs font-semibold"
				>
					{monogram}
				</span>
				{#if badge > 0}
					<span
						class="text-muted-foreground group-data-[collapsible=icon]:hidden ms-auto shrink-0 tabular-nums"
					>
						({badge})
					</span>
				{/if}
			</a>
		{/snippet}
	</Sidebar.MenuButton>
</Sidebar.MenuItem>
