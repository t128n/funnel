<script lang="ts">
	import * as Collapsible from '#lib/components/primitives/collapsible';
	import * as Sidebar from '#lib/components/primitives/sidebar/index.js';
	import { cn } from '#lib/utils.js';
	import type { Snippet } from 'svelte';

	/**
	 * A scoped block of sidebar destinations with an optional heading. Omit
	 * `label` for an unlabeled block. Collapsible by default; pass
	 * `collapsible={false}` for a static heading (e.g. the settings nav, whose
	 * groups are small).
	 *
	 * Bugzilla chrome: the heading is 11px/600 uppercase muted text above a 1px
	 * rule, with a plain `+`/`−` toggle marker instead of a chevron icon.
	 *
	 * In the icon rail (and the mobile sheet) the body always stays mounted, so
	 * a collapsed section never strands its links in the rail.
	 */
	interface Props {
		/** Section heading; omit for an unlabeled block. */
		label?: string;
		/** Whether the body is collapsed; ignored while the rail is active. */
		collapsed?: boolean;
		/** Toggles `collapsed`, wired to the heading button. */
		onToggle?: () => void;
		/** Render the heading as a toggle; `false` renders a static heading. */
		collapsible?: boolean;
		class?: string;
		children: Snippet;
	}

	let {
		label,
		collapsed = false,
		onToggle,
		collapsible = true,
		class: className,
		children
	}: Props = $props();

	const sidebar = Sidebar.useSidebar();
	const canCollapse = $derived(collapsible && !!label);
	const forceOpen = $derived(sidebar.isMobile || sidebar.state === 'collapsed');
	const open = $derived(!canCollapse || !collapsed || forceOpen);

	const headingClass =
		'group-data-[collapsible=icon]:hidden flex h-7 w-full shrink-0 items-center gap-1.5 border-t border-[color:var(--border)] px-2 text-xs font-semibold tracking-wider uppercase';
</script>

<Sidebar.Group class={cn('gap-1', className)}>
	<Collapsible.Root
		open={open}
		onOpenChange={(next) => {
			if (canCollapse && next !== open) onToggle?.();
		}}
		class="contents"
	>
		{#if label}
			{#if canCollapse}
				<Collapsible.Trigger
					class={cn(
						headingClass,
						'text-muted-foreground hover:text-foreground focus-visible:ring-sidebar-ring transition-colors outline-hidden focus-visible:ring-2'
					)}
				>
					<span class="w-2 shrink-0 text-center font-mono" aria-hidden="true">
						{open ? '−' : '+'}
					</span>
					<span class="truncate">{label}</span>
				</Collapsible.Trigger>
			{:else}
				<div class={cn(headingClass, 'text-muted-foreground')}>
					<span class="truncate">{label}</span>
				</div>
			{/if}
		{/if}

		<Collapsible.Content>
			<Sidebar.GroupContent>
				<Sidebar.Menu>
					{@render children()}
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Collapsible.Content>
	</Collapsible.Root>
</Sidebar.Group>
