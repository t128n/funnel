<script lang="ts">
	import { Button, ButtonGroup } from '@sveltestrap/sveltestrap';

	/**
	 * Presentational segmented control: a set of mutually exclusive options.
	 * Callers own the URLs and the active flag, so it works for both the Issues
	 * `All`/`Mine` scope and its `Open`/`Closed`/`All` state switch.
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

<ButtonGroup size="sm" role="group" aria-label={label}>
	{#each items as item (item.label)}
		<Button
			color="outline-secondary"
			size="sm"
			href={item.href}
			active={item.active}
			aria-current={item.active ? 'page' : undefined}
		>
			{item.label}
		</Button>
	{/each}
</ButtonGroup>
