<script lang="ts">
	import { cn } from '#lib/utils';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';

	/** Collapsible section header for grouped issue lists (`In progress · 4`). */
	interface Props {
		label: string;
		count: number;
		collapsed: boolean;
		ontoggle: () => void;
	}

	let { label, count, collapsed, ontoggle }: Props = $props();
</script>

<button
	type="button"
	class="issue-group-header flex h-(--size-row-compact) w-full items-center gap-1.5 border-b border-border-subtle bg-canvas px-3 text-left text-caption font-semibold text-fg-secondary"
	aria-expanded={!collapsed}
	onclick={ontoggle}
>
	<ChevronRightIcon
		class={cn('size-3.5 shrink-0 transition-transform', !collapsed && 'rotate-90')}
		aria-hidden="true"
	/>
	<span class="truncate">{label}</span>
	<span class="tabular-nums text-fg-muted">{count}</span>
</button>

<style>
	@media (hover: hover) and (pointer: fine) {
		.issue-group-header:hover {
			background: var(--color-surface);
		}
	}
</style>
