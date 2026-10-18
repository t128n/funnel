<script lang="ts">
	import IntakeTag from '#lib/components/common/IntakeTag.svelte';
	import { selectSubmission } from '#lib/client/selection.svelte';
	import { timeAgo } from '#lib/client/clock.svelte';
	import type { StagedSubmission } from '#lib/server/intake/staging';
	import { cn } from '#lib/utils';
	import * as Item from '#lib/components/ui/item/index.js';

	interface Props {
		submission: StagedSubmission;
		selected?: boolean;
	}

	let { submission, selected = false }: Props = $props();

	function select() {
		selectSubmission(submission.id);
	}
</script>

<Item.Root
	size="xs"
	class={cn('cursor-pointer select-none hover:bg-accent', selected && 'bg-accent')}
	role="button"
	tabindex={0}
	aria-current={selected ? 'true' : undefined}
	onclick={select}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			select();
		}
	}}
>
	<Item.Media class="pt-0.5">
		<IntakeTag />
	</Item.Media>

	<Item.Content class="min-w-0">
		<Item.Title class="w-full min-w-0">
			<span class="text-foreground min-w-0 flex-1 truncate" title={submission.title}>
				{submission.title}
			</span>
		</Item.Title>
		<div class="mono text-muted-foreground truncate text-xs">
			{submission.source ?? 'via intake'}
		</div>
	</Item.Content>

	<Item.Actions class="shrink-0 items-center self-start pt-0.5">
		<span
			class="text-muted-foreground text-xs"
			title={new Date(submission.createdAt).toLocaleString()}
		>
			{timeAgo(submission.createdAt)}
		</span>
	</Item.Actions>
</Item.Root>
