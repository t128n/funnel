<script lang="ts">
	import { goto } from '$app/navigation';
	import * as ToggleGroup from '#lib/components/primitives/toggle-group/index.js';

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

	const active = $derived(items.find((item) => item.active)?.label ?? '');

	function onChange(value: string) {
		const next = items.find((item) => item.label === value);
		if (next && !next.active) {
			void goto(next.href, { reset: false });
		}
	}
</script>

<ToggleGroup.Root
	type="single"
	size="sm"
	variant="outline"
	value={active}
	onValueChange={onChange}
	aria-label={label}
>
	{#each items as item (item.label)}
		<ToggleGroup.Item value={item.label}>{item.label}</ToggleGroup.Item>
	{/each}
</ToggleGroup.Root>
