<script lang="ts">
	import { selectSubmission } from '#lib/client/selection.svelte';
	import { relativeTime } from '#lib/time';
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
		<span
			class="bg-primary/10 text-primary shrink-0 px-1 py-0.5 text-[0.625rem] font-semibold tracking-wider uppercase"
		>
			intake
		</span>
		<span class="text-foreground flex-1 truncate text-sm" title={submission.title}>
			{submission.title}
		</span>
		<span class="text-muted-foreground shrink-0 text-xs" title={new Date(submission.createdAt).toLocaleString()}>
			{relativeTime(submission.createdAt)}
		</span>
	</div>
	<div class="mono text-muted-foreground truncate pl-0.5 text-xs">
		{submission.source ?? 'via intake'}
	</div>
</div>
