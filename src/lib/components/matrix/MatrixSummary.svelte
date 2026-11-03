<script lang="ts">
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';

	/**
	 * The two assessment counts above the workspace. They are live values from
	 * the same scoped dataset as the matrix, so a rating change updates both.
	 * The queue action is only rendered for writers with work waiting.
	 */
	interface Props {
		needsAssessment: number;
		rated: number;
		/** Opens the assessment queue; omitted for read-only viewers. */
		onreview?: (() => void) | null;
	}

	let { needsAssessment, rated, onreview = null }: Props = $props();
</script>

<section
	class="grid grid-cols-1 border-y border-border-subtle sm:grid-cols-2"
	aria-label="Assessment summary"
>
	<div class="flex flex-col gap-1 py-3 sm:pe-6">
		<h2 class="text-body font-semibold text-fg">Needs assessment</h2>
		<p class="text-heading-sm font-semibold leading-heading-sm tabular-nums text-fg">
			{needsAssessment}
		</p>
		<p class="text-caption text-fg-secondary">Issues awaiting classification</p>
		{#if onreview && needsAssessment > 0}
			<button
				type="button"
				class="link mt-1 inline-flex min-h-(--size-control-sm) w-fit items-center gap-1 text-body font-semibold"
				aria-haspopup="dialog"
				onclick={onreview}
			>
				Review queue
				<ArrowRightIcon class="size-3.5" aria-hidden="true" />
			</button>
		{/if}
	</div>

	<div
		class="flex flex-col gap-1 border-t border-border-subtle py-3 sm:border-t-0 sm:border-l sm:ps-6"
	>
		<h2 class="text-body font-semibold text-fg">Rated issues</h2>
		<p class="text-heading-sm font-semibold leading-heading-sm tabular-nums text-fg">
			{rated}
		</p>
		<p class="text-caption text-fg-secondary">Issues classified in the matrix</p>
	</div>
</section>
