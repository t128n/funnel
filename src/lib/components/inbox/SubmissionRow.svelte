<script lang="ts">
	import IntakeTag from '#lib/components/common/IntakeTag.svelte';
	import { selectSubmission } from '#lib/client/selection.svelte';
	import { timeAgo } from '#lib/client/clock.svelte';
	import type { StagedSubmission } from '#lib/server/intake/staging';
	import { cn } from '#lib/utils';

	interface Props {
		submission: StagedSubmission;
		selected?: boolean;
	}

	let { submission, selected = false }: Props = $props();

	function select() {
		selectSubmission(submission.id);
	}
</script>

<div
	class={cn(
		'focus-visible:ring-ring/50 hover:bg-accent flex cursor-pointer flex-col gap-0.5 p-2 outline-none transition-colors select-none focus-visible:ring-1',
		selected && 'bg-accent'
	)}
	role="button"
	tabindex="0"
	aria-current={selected ? 'true' : undefined}
	onclick={select}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			select();
		}
	}}
>
	<div class="flex min-w-0 items-center gap-2">
		<IntakeTag />
		<span class="text-foreground flex-1 truncate text-sm" title={submission.title}>
			{submission.title}
		</span>
		<span class="text-muted-foreground shrink-0 text-xs" title={new Date(submission.createdAt).toLocaleString()}>
			{timeAgo(submission.createdAt)}
		</span>
	</div>
	<div class="mono text-muted-foreground truncate pl-0.5 text-xs">
		{submission.source ?? 'via intake'}
	</div>
</div>
