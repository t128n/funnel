<script lang="ts">
	import { page } from '$app/state';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import FeedSearch from '#lib/components/filter/FeedSearch.svelte';
	import FilterPopover from '#lib/components/filter/FilterPopover.svelte';
	import ViewSegment from '#lib/components/filter/ViewSegment.svelte';
	import MatrixGrid from '#lib/components/matrix/MatrixGrid.svelte';
	import { matrixGrid } from '#lib/components/matrix/matrix-grid';
	import { parseIssueParams, type IssueParams } from '#lib/issue-url';
	import { IMPACT_SCALE, URGENCY_SCALE } from '#lib/priority';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const grid = $derived(matrixGrid(data.matrix));
	const total = $derived(data.matrix.total);
	const selected = $derived(parseIssueParams(page.params as IssueParams));
</script>

<PageHead
	title="Matrix"
	description="The impact × urgency matrix over the filtered issue stream."
/>

<div class="bg-background relative flex min-h-0 min-w-0 flex-1">
	<div class="flex min-h-0 min-w-0 flex-1 flex-col">
		<header
			class="border-[color:var(--border)] flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1.5 sm:py-0"
		>
			<h1 class="text-xl font-semibold tracking-tight">Matrix</h1>
			<span class="text-muted-foreground text-xs">{total}</span>
			<div
				class="order-last w-full min-w-0 sm:order-none sm:mx-auto sm:w-auto sm:max-w-md sm:flex-1 sm:px-2"
			>
				<FeedSearch />
			</div>
			<div class="ml-auto flex shrink-0 items-center gap-2">
				<ViewSegment />
				<FilterPopover options={data.options} showState />
				<details class="relative">
					<summary class="link cursor-pointer text-sm select-none list-none">
						How to rate
					</summary>
					<div
						class="border-[color:var(--border)] bg-background absolute top-full right-0 z-20 mt-1 max-h-[70vh] w-80 overflow-y-auto border p-3 text-sm shadow-lg"
					>
						<div class="text-muted-foreground text-xs font-medium tracking-wider uppercase">
							Impact · How much does it hurt?
						</div>
						{#each IMPACT_SCALE as level (level.value)}
							<div class="mt-2">
								<div class="font-medium">{level.value} · {level.name}</div>
								<div class="text-muted-foreground text-xs">{level.definition}</div>
								<ul class="mt-1 list-disc pl-4 text-xs">
									{#each level.criteria as criterion (criterion.label)}
										<li>
											<span class="font-medium">{criterion.label}</span>
											— {criterion.anchor}
										</li>
									{/each}
								</ul>
							</div>
						{/each}
						<div class="text-muted-foreground mt-3 text-xs font-medium tracking-wider uppercase">
							Urgency · How soon must it be fixed?
						</div>
						{#each URGENCY_SCALE as level (level.value)}
							<div class="mt-2">
								<div class="font-medium">{level.value} · {level.name}</div>
								<div class="text-muted-foreground text-xs">{level.definition}</div>
								<ul class="mt-1 list-disc pl-4 text-xs">
									{#each level.criteria as criterion (criterion.label)}
										<li>
											<span class="font-medium">{criterion.label}</span>
											— {criterion.anchor}
										</li>
									{/each}
								</ul>
							</div>
						{/each}
					</div>
				</details>
			</div>
		</header>

		<div class="min-h-0 flex-1 overflow-auto">
			<MatrixGrid rows={grid} />
		</div>
	</div>

	<!-- The child detail route docks the Inspector beside the grid (the pane
	     styles its own width/borders when not `fill`ed). -->
	{@render children()}
</div>
