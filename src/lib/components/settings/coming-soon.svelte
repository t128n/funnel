<script lang="ts">
	import ConstructionIcon from '@lucide/svelte/icons/construction';
	import * as Empty from '#lib/components/ui/empty';

	interface Props {
		/** Section title shown in the placeholder. */
		label: string;
	}

	let { label }: Props = $props();
</script>

<Empty.Root class="border">
	<Empty.Header>
		<Empty.Media variant="icon">
			<ConstructionIcon />
		</Empty.Media>
		<Empty.Title>{label}</Empty.Title>
		<Empty.Description>This section isn't wired up yet.</Empty.Description>
	</Empty.Header>
</Empty.Root>
