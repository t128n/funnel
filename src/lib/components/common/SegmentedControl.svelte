<script lang="ts">
	import { cn } from '#lib/utils';

	/**
	 * Presentational segmented control: a pill of mutually exclusive, link-based
	 * options. Callers own the URLs and the active flag, so it works for both the
	 * Issues `All`/`Mine` scope and its `Open`/`Closed`/`All` state switch.
	 */
	export interface SegmentItem {
		label: string;
		href: string;
		active: boolean;
	}

	interface Props {
		items: SegmentItem[];
		/** Accessible group name, e.g. "Issue view". */
		label: string;
	}

	let { items, label }: Props = $props();
</script>

<div
	class="bg-muted inline-flex h-7 shrink-0 items-center gap-0.5 p-0.5"
	role="group"
	aria-label={label}
>
	{#each items as item (item.label)}
		<a
			class={cn(
				'text-muted-foreground hover:text-foreground inline-flex h-full items-center px-2 text-xs no-underline transition-colors hover:bg-background hover:no-underline',
				item.active && 'bg-background text-foreground font-medium'
			)}
			href={item.href}
			aria-current={item.active ? 'true' : undefined}
		>
			{item.label}
		</a>
	{/each}
</div>
