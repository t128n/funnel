<script lang="ts">
	import PageHead from '#lib/components/common/PageHead.svelte';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import Toolbar from '#lib/components/shell/Toolbar.svelte';
	import FeedSearch from '#lib/components/filter/FeedSearch.svelte';
	import FilterPopover from '#lib/components/filter/FilterPopover.svelte';
	import ViewSegment from '#lib/components/filter/ViewSegment.svelte';
	import MatrixGrid from '#lib/components/matrix/MatrixGrid.svelte';
	import { matrixGrid } from '#lib/components/matrix/matrix-grid';
	import { page } from '$app/state';
	import { parseIssueParams, type IssueParams } from '#lib/issue-url';
	import { Button } from '#lib/components/ui/button';
	import * as Dialog from '#lib/components/ui/dialog';
	import { IMPACT_SCALE, URGENCY_SCALE } from '#lib/priority';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const grid = $derived(matrixGrid(data.matrix));
	const total = $derived(data.matrix.total);
	const selected = $derived(parseIssueParams(page.params as IssueParams));
	let guideOpen = $state(false);

	const guides = [
		{
			title: 'Impact',
			question: 'How much does it hurt?',
			levels: IMPACT_SCALE
		},
		{
			title: 'Urgency',
			question: 'How soon must it be fixed?',
			levels: URGENCY_SCALE
		}
	] as const;
</script>

<PageHead title="Matrix" description="The impact × urgency matrix over the filtered issue stream." />

<div class="relative flex min-h-0 min-w-0 flex-1">
	<div class={selected ? "hidden min-h-0 min-w-0 flex-1 flex-col lg:flex" : "flex min-h-0 min-w-0 flex-1 flex-col"}>
		<PageHeader title="Matrix" count={total} level={selected ? 2 : 1} />

		<Toolbar>
			<div class="min-w-0 flex-1">
				<FeedSearch />
			</div>
			<ViewSegment />
			<FilterPopover options={data.options} showState />
			<Button variant="outline" size="sm" onclick={() => (guideOpen = true)}>
				Rating Guide
			</Button>
		</Toolbar>

		{#if total === 0}
			<div class="shrink-0 px-[var(--layout-page-padding)] py-2">
				<InlineStatus tone="info" message="No issues match these filters." />
			</div>
		{/if}

		<div class="min-h-0 flex-1 overflow-auto">
			<MatrixGrid rows={grid} />
		</div>
	</div>

	<!-- The child detail route docks the Inspector beside the grid above 1024px
	     and takes the full width below it. -->
	<div class={selected ? "flex min-h-0 min-w-0 flex-1" : "hidden lg:flex"}>
		{@render children()}
	</div>
</div>

<Dialog.Root open={guideOpen} onOpenChange={(next) => (guideOpen = next)}>
	<Dialog.Content class="sm:max-w-[var(--layout-settings-max)]">
		<Dialog.Header>
			<Dialog.Title>Rating Guide</Dialog.Title>
			<Dialog.Description>
				Priority comes from the pair of impact and urgency levels. Assess both axes before
				choosing a priority.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-6">
			{#each guides as guide (guide.title)}
				<section class="flex flex-col gap-2" aria-label={guide.title}>
					<div>
						<h3 class="text-heading-sm font-semibold text-fg">{guide.title}</h3>
						<p class="text-body text-fg-secondary">{guide.question}</p>
					</div>
					<div class="flex flex-col">
						{#each guide.levels as level (level.value)}
							<div class="border-t border-border-subtle py-2">
								<h4 class="text-body font-semibold text-fg">{level.value} · {level.name}</h4>
								<p class="text-caption text-fg-secondary">{level.definition}</p>
								<dl class="mt-1 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-0.5">
									{#each level.criteria as criterion (criterion.label)}
										<dt class="text-caption font-semibold text-fg">{criterion.label}</dt>
										<dd class="m-0 text-caption text-fg-secondary">{criterion.anchor}</dd>
									{/each}
								</dl>
							</div>
						{/each}
					</div>
				</section>
			{/each}
		</div>

		<Dialog.Footer>
			<Button variant="outline" size="sm" onclick={() => (guideOpen = false)}>Close</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
