<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from '@sveltestrap/sveltestrap';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import FeedSearch from '#lib/components/filter/FeedSearch.svelte';
	import FilterPopover from '#lib/components/filter/FilterPopover.svelte';
	import ViewSegment from '#lib/components/filter/ViewSegment.svelte';
	import AssessmentQueue from '#lib/components/matrix/AssessmentQueue.svelte';
	import MatrixCellDetail from '#lib/components/matrix/MatrixCellDetail.svelte';
	import MatrixGrid from '#lib/components/matrix/MatrixGrid.svelte';
	import MatrixSummary from '#lib/components/matrix/MatrixSummary.svelte';
	import { matrixGrid } from '#lib/components/matrix/matrix-grid';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import Toolbar from '#lib/components/shell/Toolbar.svelte';
	import { matrixCellValue, parseMatrixCell } from '#lib/matrix';
	import { IMPACT_SCALE, URGENCY_SCALE } from '#lib/priority';
	import { canWrite } from '#lib/roles';
	import type { PageProps } from './$types';

	/**
	 * Matrix (Composition A): one centered page holding the impact × urgency
	 * assessment workspace. The grid selects a cell in `?cell=`, the detail
	 * column lists that cell's issues, and the assessment queue handles issues
	 * that are still missing an axis. Opening an issue goes to the dedicated
	 * `/issues/...` page; there is no docked Inspector.
	 */
	let { data }: PageProps = $props();

	const grid = $derived(matrixGrid(data.matrix));
	const selection = $derived(data.selection);
	const mayWrite = $derived(
		canWrite((page.data as { user?: { role?: unknown } }).user?.role)
	);
	let guideOpen = $state(false);
	let queueOpen = $state(false);

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

	/**
	 * Write the server's initial choice into the URL without another load, so
	 * the default selection is explicit before an issue is opened and survives
	 * filter changes.
	 */
	$effect(() => {
		if (parseMatrixCell(page.url.searchParams.get('cell'))) return;
		const url = new URL(page.url.href);
		url.searchParams.set('cell', matrixCellValue(selection.impact, selection.urgency));
		void goto(url, { replace: true, shallow: true });
	});

	/** Cell selection lives in `?cell=`, so it is shareable and filter-safe. */
	function selectCell(impact: number, urgency: number): void {
		const value = matrixCellValue(impact, urgency);
		if (page.url.searchParams.get('cell') === value) return;
		const url = new URL(page.url.href);
		url.searchParams.set('cell', value);
		void goto(url, { reset: false });
	}

	function closeGuide() {
		guideOpen = false;
	}
</script>

<PageHead title="Matrix" description="The impact × urgency matrix over the filtered issue stream." />

<main class="container-xl py-4">
	<PageHeader title="Matrix" count={data.matrix.total} />

	<Toolbar>
		<div class="min-w-0 flex-grow-1">
			<FeedSearch />
		</div>
		<ViewSegment />
		<FilterPopover options={data.options} showState />
		<Button color="outline-secondary" onclick={() => (guideOpen = true)}>Rating Guide</Button>
	</Toolbar>

	{#if data.matrix.total === 0}
		<div class="mb-2">
			<InlineStatus tone="info" message="No issues match these filters." />
		</div>
	{/if}

	<MatrixSummary
		needsAssessment={data.matrix.needsAssessment}
		rated={data.matrix.rated}
		onreview={mayWrite ? () => (queueOpen = true) : null}
	/>

	<div class="row g-4 mt-1">
		<section class="col-lg-5" aria-labelledby="matrix-heading">
			<div class="d-flex flex-column gap-1">
				<h2 id="matrix-heading" class="fs-5 fw-semibold mb-0">Priority matrix</h2>
				<p class="small text-body-secondary mb-0">Impact × urgency</p>
			</div>
			<div class="mt-3">
				<MatrixGrid rows={grid} selected={selection} onselect={selectCell} />
			</div>
		</section>

		<section class="col-lg-7" aria-labelledby="matrix-detail-heading">
			<MatrixCellDetail
				impact={selection.impact}
				urgency={selection.urgency}
				total={selection.issues.total}
				issues={selection.issues.items}
				repoShortcodes={data.repoShortcodes}
			/>
		</section>
	</div>
</main>

{#if mayWrite}
	<AssessmentQueue
		open={queueOpen}
		issues={data.assessment.items}
		total={data.assessment.total}
		onopenchange={(open) => (queueOpen = open)}
	/>
{/if}

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
