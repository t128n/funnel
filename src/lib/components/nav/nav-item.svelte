<script lang="ts">
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import { cn } from '#lib/utils.js';

	/**
	 * One sidebar destination: leading icon, label, optional count badge.
	 *
	 * The active state is a single pill (`data-active` on the menu button) plus
	 * a tinted icon — never a second indicator. Every row carries an icon so the
	 * sidebar scans as icons + labels rather than a bare text list.
	 */
	interface Props {
		href: string;
		label: string;
		// Lucide icon components are not typed as `Component` yet.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		icon?: any;
		active?: boolean;
		/** Count rendered in the trailing badge; hidden when zero or absent. */
		badge?: number;
		/** Destructive styling for time-sensitive alerts (Attention). */
		tone?: 'neutral' | 'destructive';
		class?: string;
	}

	let {
		href,
		label,
		icon,
		active = false,
		badge = 0,
		tone = 'neutral',
		class: className
	}: Props = $props();
</script>

<Sidebar.MenuItem>
	<Sidebar.MenuButton
		isActive={active}
		tooltipContent={label}
		class={cn(className, active && '[&_svg]:text-sidebar-primary')}
	>
		{#snippet child({ props })}
			{@const Icon = icon}
			<a href={href} aria-current={active ? 'page' : undefined} {...props}>
				{#if Icon}<Icon />{/if}
				<span>{label}</span>
			</a>
		{/snippet}
	</Sidebar.MenuButton>
	{#if badge > 0}
		<Sidebar.MenuBadge class={tone === 'destructive' ? 'bg-destructive text-white' : undefined}>
			{badge}
		</Sidebar.MenuBadge>
	{/if}
</Sidebar.MenuItem>
