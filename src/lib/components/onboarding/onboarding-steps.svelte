<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import { cn } from '#lib/utils.js';

	interface Props {
		/** 1-based index of the current step. */
		active: number;
	}

	let { active }: Props = $props();

	const steps = ['Create app', 'Install', 'Ready'];
</script>

<nav aria-label="Setup progress">
	<ol class="flex flex-wrap items-center gap-x-3 gap-y-2 text-caption text-fg-secondary">
		{#each steps as label, index (label)}
			{@const step = index + 1}
			{@const done = step < active}
			{@const current = step === active}
			<li class="flex items-center gap-1.5" aria-current={current ? 'step' : undefined}>
				{#if done}
					<CheckIcon class="size-3.5 shrink-0 text-success" aria-hidden="true" />
				{:else}
					<span class="mono" aria-hidden="true">{step}</span>
				{/if}
				<span class={cn(current && 'font-semibold text-fg', done && 'text-fg')}>
					{label}
				</span>
			</li>
			{#if step < steps.length}
				<li class="list-none" aria-hidden="true">
					<span class="block h-px w-4 bg-border-subtle"></span>
				</li>
			{/if}
		{/each}
	</ol>
</nav>
