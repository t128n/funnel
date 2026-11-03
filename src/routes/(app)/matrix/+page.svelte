<script lang="ts">
	import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from '@sveltestrap/sveltestrap';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import Toolbar from '#lib/components/shell/Toolbar.svelte';
	import FeedSearch from '#lib/components/filter/FeedSearch.svelte';
	import FilterPopover from '#lib/components/filter/FilterPopover.svelte';
	import ViewSegment from '#lib/components/filter/ViewSegment.svelte';
	import MatrixGrid from '#lib/components/matrix/MatrixGrid.svelte';
	import { matrixGrid } from '#lib/components/matrix/matrix-grid';
	import { IMPACT_SCALE, URGENCY_SCALE } from '#lib/priority';
	import type { PageProps } from './$types';

	/**
	 * Matrix (Composition A §3.5): one centered page holding the impact ×
	 * urgency grid. The grid keeps its own layout and semantics; cards open the
	 * dedicated `/issues/<owner>/<repo>/<n>` page, so there is no docked pane.
	 */
	let { data }: PageProps = $props();

	const grid = $derived(matrixGrid(data.matrix));
	const total = $derived(data.matrix.total);
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

	function closeGuide() {
		guideOpen = false;
	}
</script>

<PageHead title="Matrix" description="The impact × urgency matrix over the filtered issue stream." />

<main class="container-xl py-4">
	<PageHeader title="Matrix" count={total} />

	<Toolbar>
		<div class="min-w-0 flex-grow-1">
			<FeedSearch />
		</div>
		<ViewSegment />
		<FilterPopover options={data.options} showState />
		<Button color="outline-secondary" onclick={() => (guideOpen = true)}>Rating Guide</Button>
	</Toolbar>

	{#if total === 0}
		<div class="mb-2">
			<InlineStatus tone="info" message="No issues match these filters." />
		</div>
	{/if}

	<MatrixGrid rows={grid} />
</main>

<Modal isOpen={guideOpen} toggle={closeGuide} size="lg" scrollable>
	<ModalHeader toggle={closeGuide}>Rating Guide</ModalHeader>
	<ModalBody>
		<p class="text-body-secondary">
			Priority comes from the pair of impact and urgency levels. Assess both axes before
			choosing a priority.
		</p>

		<div class="d-flex flex-column gap-3">
			{#each guides as guide (guide.title)}
				<section class="d-flex flex-column gap-2" aria-label={guide.title}>
					<div>
						<h3 class="fs-6 text-body mb-1">{guide.title}</h3>
						<p class="text-body text-body-secondary mb-0">{guide.question}</p>
					</div>
					<div class="d-flex flex-column">
						{#each guide.levels as level (level.value)}
							<div class="border-top py-2">
								<h4 class="text-body fw-medium mb-1">{level.value} · {level.name}</h4>
								<p class="small text-body-secondary mb-0">{level.definition}</p>
								<dl class="guide-criteria mt-1 mb-0">
									{#each level.criteria as criterion (criterion.label)}
										<dt class="small fw-medium text-body">{criterion.label}</dt>
										<dd class="small text-body-secondary m-0">{criterion.anchor}</dd>
									{/each}
								</dl>
							</div>
						{/each}
					</div>
				</section>
			{/each}
		</div>
	</ModalBody>
	<ModalFooter>
		<Button color="outline-secondary" size="sm" onclick={closeGuide}>Close</Button>
	</ModalFooter>
</Modal>

<style>
	.guide-criteria {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr);
		gap: 0.125rem 0.75rem;
	}
</style>
