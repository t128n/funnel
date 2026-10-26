<script lang="ts">
	import * as Empty from '#lib/components/primitives/empty';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';

	/**
	 * Empty state for a view's detail column: shown at the base URL before an
	 * item is selected (and when a detail link does not resolve).
	 */
	interface Props {
		title?: string;
		description?: string;
	}

	let {
		title = 'Nothing selected',
		description = 'Select an item to view its details.'
	}: Props = $props();
</script>

<Empty.Root class="h-full">
	<Empty.Header>
		<Empty.Media variant="icon">
			<ArrowRightIcon />
		</Empty.Media>
		<Empty.Title>{title}</Empty.Title>
		<Empty.Description>{description}</Empty.Description>
	</Empty.Header>
</Empty.Root>
