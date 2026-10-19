<script lang="ts">
	import { cn } from '#lib/utils';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';

	/** Collapsible section header for grouped issue lists (`In Progress · 4`). */
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
	class="text-muted-foreground hover:text-foreground flex w-full items-center gap-1 px-2 py-1.5 text-left text-[11px] font-medium tracking-wide uppercase"
	aria-expanded={!collapsed}
	onclick={ontoggle}
>
	<ChevronRightIcon
		class={cn('size-3.5 shrink-0 transition-transform', !collapsed && 'rotate-90')}
	/>
	<span class="truncate">{label}</span>
	<span class="mono text-muted-foreground/70">{count}</span>
</button>
