<script lang="ts">
	import PageHead from '#lib/components/common/PageHead.svelte';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import Toolbar from '#lib/components/shell/Toolbar.svelte';
	import FeedSearch from '#lib/components/filter/FeedSearch.svelte';
	import FilterPopover from '#lib/components/filter/FilterPopover.svelte';
	import ViewSegment from '#lib/components/filter/ViewSegment.svelte';
	import AssessmentQueue from '#lib/components/matrix/AssessmentQueue.svelte';
	import MatrixCellDetail from '#lib/components/matrix/MatrixCellDetail.svelte';
	import MatrixGrid from '#lib/components/matrix/MatrixGrid.svelte';
	import MatrixSummary from '#lib/components/matrix/MatrixSummary.svelte';
	import { matrixGrid } from '#lib/components/matrix/matrix-grid';
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { parseIssueParams, type IssueParams } from '#lib/issue-url';
	import { matrixCellValue, parseMatrixCell } from '#lib/matrix';
	import { canWrite } from '#lib/roles';
	import { IMPACT_SCALE, URGENCY_SCALE } from '#lib/priority';
	import { Button } from '#lib/components/ui/button';
	import * as Dialog from '#lib/components/ui/dialog';
	import { cn } from '#lib/utils';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const grid = $derived(matrixGrid(data.matrix));
	const selection = $derived(data.selection);
	const selectedIssue = $derived(parseIssueParams(page.params as IssueParams));
	const mayWrite = $derived(canWrite(data.user.role));

	let guideOpen = $state(false);
	let queueOpen = $state(false);

	/**
	 * The Inspector is a route, not a dialog, so its close button unmounts with
	 * the pane. Return focus to the selected cell's heading when the reader
	 * comes back to the matrix.
	 */
	let inspectorWasOpen = false;
	$effect(() => {
		if (selectedIssue !== null) {
			inspectorWasOpen = true;
			return;
		}
		if (!inspectorWasOpen) return;
		inspectorWasOpen = false;
		void tick().then(() => {
			document.getElementById('matrix-detail-heading')?.focus();
		});
	});

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
	 * the default selection is explicit before an Inspector is opened and
	 * survives closing it.
	 */
	$effect(() => {
		if (parseMatrixCell(page.url.searchParams.get('cell'))) return;
		const url = new URL(page.url.href);
		url.searchParams.set(
			'cell',
			matrixCellValue(selection.impact, selection.urgency)
		);
		void goto(url, { replace: true, shallow: true });
	});

	/**
	 * Cell selection lives in `?cell=<impact>-<urgency>` so it is shareable and
	 * survives search, scope, and filter changes. Navigation is client-side;
	 * the grid and details pane update from the same load as the counts.
	 */
	function selectCell(impact: number, urgency: number): void {
		const value = matrixCellValue(impact, urgency);
		if (page.url.searchParams.get('cell') === value) return;
		const url = new URL(page.url.href);
		url.searchParams.set('cell', value);
		void goto(url, { reset: false });
	}
</script>

<PageHead title="Matrix" description="The impact × urgency matrix over the filtered issue stream." />

<div class="flex min-h-0 min-w-0 flex-1 flex-col">
	<!-- Page chrome stays full width, so opening the Inspector never squeezes
	     the toolbar or the assessment summary into a narrow column. -->
	<div class={cn('shrink-0', selectedIssue && 'hidden xl:block')}>
		<PageHeader title="Matrix" count={data.matrix.total} level={selectedIssue ? 2 : 1} />

		<Toolbar>
			<div class="min-w-0 w-full sm:flex-1">
				<FeedSearch />
			</div>
			<ViewSegment />
			<FilterPopover options={data.options} showState />
			<Button
				variant="outline"
				size="sm"
				aria-haspopup="dialog"
				onclick={() => (guideOpen = true)}
			>
				Rating Guide
			</Button>
		</Toolbar>
	</div>

	<div
		class={cn(
			'flex min-h-0 flex-1 flex-col',
			selectedIssue
				? 'overflow-hidden xl:px-[var(--layout-page-padding)] xl:py-[var(--space-block)]'
				: 'overflow-auto px-[var(--layout-page-padding)] py-[var(--space-block)] xl:overflow-hidden'
		)}
	>
		{#if data.matrix.total === 0}
			<div class={cn('mb-[var(--space-block)]', selectedIssue && 'hidden xl:block')}>
				<InlineStatus tone="info" message="No issues match these filters." />
			</div>
		{/if}

		<div class={cn('shrink-0', selectedIssue && 'hidden xl:block')}>
			<MatrixSummary
				needsAssessment={data.matrix.needsAssessment}
				rated={data.matrix.rated}
				onreview={mayWrite ? () => (queueOpen = true) : null}
			/>
		</div>

		<div
			class={cn(
				'min-w-0',
				selectedIssue
					? 'mt-0 flex min-h-0 flex-1 flex-col gap-[var(--space-region)] xl:mt-[var(--space-region)] xl:flex-row'
					: 'mt-[var(--space-region)] grid grid-cols-1 gap-[var(--space-region)] xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]'
			)}
		>
			<section
				class={cn(
					'min-w-0',
					selectedIssue
						? 'hidden min-h-0 flex-col overflow-auto xl:flex xl:w-[var(--layout-matrix-pane)] xl:shrink-0'
						: 'xl:min-h-0 xl:overflow-auto'
				)}
				aria-labelledby="matrix-heading"
			>
				<div class="flex flex-col gap-0.5">
					<h2
						id="matrix-heading"
						class="text-heading-sm font-semibold leading-heading-sm text-fg"
					>
						Priority matrix
					</h2>
					<p class="text-caption text-fg-secondary">Impact × urgency</p>
				</div>
				<div class="mt-[var(--space-block)]">
					<MatrixGrid rows={grid} selected={selection} onselect={selectCell} />
				</div>
			</section>

			<section
				class={cn(
					'min-h-0 min-w-0 flex-1',
					selectedIssue
						? 'flex flex-col xl:border-l xl:border-border-subtle'
						: 'xl:min-h-0 xl:overflow-auto xl:border-l xl:border-border-subtle xl:pl-[var(--space-region)]'
				)}
				aria-labelledby={selectedIssue ? undefined : 'matrix-detail-heading'}
			>
				{#if selectedIssue}
					{@render children()}
				{:else}
					<MatrixCellDetail
						impact={selection.impact}
						urgency={selection.urgency}
						total={selection.issues.total}
						issues={selection.issues.items}
						repoShortcodes={data.repoShortcodes}
					/>
				{/if}
			</section>
		</div>
	</div>
</div>

{#if mayWrite}
	<AssessmentQueue
		open={queueOpen}
		issues={data.assessment.items}
		total={data.assessment.total}
		onopenchange={(open) => (queueOpen = open)}
	/>
{/if}

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
