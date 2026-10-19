<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import { cn } from '#lib/utils.js';

	interface Props {
		/** 1-based index of the current step. */
		active: number;
	}

	let { active }: Props = $props();

	const steps = ['Create app', 'Install', 'Repositories'];
</script>

<ol class="text-muted-foreground flex items-center justify-center gap-2 text-xs">
	{#each steps as label, index (label)}
		{@const step = index + 1}
		{@const done = step < active}
		{@const current = step === active}
		<li class="flex items-center gap-2">
			<span
				class={cn(
					'flex size-5 shrink-0 items-center justify-center rounded-full border text-[0.625rem] font-medium',
					done && 'border-transparent bg-emerald-500/15 text-emerald-400',
					current && 'border-primary text-foreground',
					!done && !current && 'border-transparent'
				)}
			>
				{#if done}
					<CheckIcon class="size-3" />
				{:else}
					{step}
				{/if}
			</span>
			<span class={cn('hidden sm:inline', current && 'text-foreground font-medium')}>
				{label}
			</span>
		</li>
		{#if step < steps.length}
			<span class="bg-border h-px w-6" aria-hidden="true"></span>
		{/if}
	{/each}
</ol>
