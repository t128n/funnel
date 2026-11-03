<script lang="ts">
	import { tick } from 'svelte';
	import { refreshAll } from '$app/navigation';
	import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from '@sveltestrap/sveltestrap';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import SingleSelect from '#lib/components/common/SingleSelect.svelte';
	import { updateIssue } from '#lib/client/mutations';
	import {
		IMPACT_SCALE,
		URGENCY_SCALE,
		impactLabel,
		urgencyLabel
	} from '#lib/priority';
	import type { IssueListItem } from '#lib/server/issues/types';

	/**
	 * The assessment queue: a filtered issue list with inline rating controls.
	 * It reuses the issue write path and the shared select control. A completed
	 * pair leaves the queue and enters its matrix cell on the next load; a
	 * partial pair keeps the existing axis and stays queued.
	 */
	interface Props {
		open: boolean;
		issues: IssueListItem[];
		total: number;
		onopenchange: (open: boolean) => void;
	}

	let { open, issues, total, onopenchange }: Props = $props();

	type Axis = 'impact' | 'urgency';

	const impactOptions = IMPACT_SCALE.map((level) => ({
		value: impactLabel(level.value)!,
		label: level.name
	}));
	const urgencyOptions = URGENCY_SCALE.map((level) => ({
		value: urgencyLabel(level.value)!,
		label: level.name
	}));

	let busy = $state(false);
	let error = $state<string | null>(null);
	let queueEl = $state<HTMLElement | null>(null);

	function titleOf(issue: IssueListItem): string {
		return issue.title.trim() || 'Untitled';
	}

	function handleOpenChange(next: boolean): void {
		if (!next) error = null;
		onopenchange(next);
	}

	function currentImpact(issue: IssueListItem): string | null {
		return issue.impact === null ? null : impactLabel(issue.impact);
	}

	function currentUrgency(issue: IssueListItem): string | null {
		return issue.urgency === null ? null : urgencyLabel(issue.urgency);
	}

	async function rate(issue: IssueListItem, axis: Axis, value: string | null): Promise<void> {
		if (busy) return;
		const hinted = axis === 'impact' ? currentUrgency(issue) : currentImpact(issue);
		busy = true;
		error = null;

		const patch = axis === 'impact' ? { impact: value } : { urgency: value };
		const result = await updateIssue(issue.repo, issue.number, patch);
		if (!result.ok) {
			busy = false;
			error = `Could not save the ${axis} rating. ${result.error}`;
			return;
		}

		// Both axes are now present, so the issue is leaving the queue.
		const completed =
			(axis === 'impact' ? value : hinted) !== null &&
			(axis === 'urgency' ? value : hinted) !== null;

		try {
			await refreshAll();
		} catch {
			error =
				'The rating was saved, but the matrix could not refresh. Reload to see the updated counts.';
		}
		busy = false;

		if (completed) {
			await tick();
			const next =
				queueEl?.querySelector<HTMLElement>('[data-assessment-row] select') ??
				document.getElementById('assessment-close');
			next?.focus();
		}
	}
</script>

<Modal isOpen={open} toggle={() => handleOpenChange(false)} size="lg" scrollable>
	<ModalHeader toggle={() => handleOpenChange(false)}>Assessment queue</ModalHeader>
	<ModalBody>
		<p class="text-body-secondary">
			{#if total === 0}
				Every issue in this scope has an impact and urgency rating.
			{:else}
				{total} {total === 1 ? 'issue needs' : 'issues need'} an impact or urgency rating.
			{/if}
		</p>

		{#if error}
			<InlineStatus tone="error" message={error} />
		{/if}

		{#if issues.length === 0}
			<p class="text-body-secondary mb-0">No issues awaiting assessment.</p>
		{:else}
			<div
				bind:this={queueEl}
				class="border-top"
				style="max-height: 60vh; overflow-y: auto; overscroll-behavior: contain;"
			>
				<ul class="list-unstyled mb-0" aria-label="Issues awaiting assessment">
					{#each issues as issue (`${issue.repoId}:${issue.number}`)}
						{@const ref = `${issue.repo}#${issue.number}`}
						<li
							class="d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3 border-bottom py-3"
							data-assessment-row
						>
							<div class="min-w-0 flex-grow-1">
								<p class="mb-1 text-break">{titleOf(issue)}</p>
								<p class="font-monospace small text-body-secondary mb-0">{ref}</p>
							</div>

							<div class="d-flex flex-shrink-0 flex-wrap align-items-start gap-3">
								<div class="d-flex flex-column gap-1">
									<span class="small text-body-secondary">Impact</span>
									<SingleSelect
										label="Not assessed"
										ariaLabel={`Impact for ${ref}: ${currentImpact(issue) ?? 'Not assessed'}`}
										options={impactOptions}
										value={currentImpact(issue)}
										onselect={(value) => void rate(issue, 'impact', value)}
										allowClear
										clearLabel="Not assessed"
										disabled={busy}
									/>
								</div>
								<div class="d-flex flex-column gap-1">
									<span class="small text-body-secondary">Urgency</span>
									<SingleSelect
										label="Not assessed"
										ariaLabel={`Urgency for ${ref}: ${currentUrgency(issue) ?? 'Not assessed'}`}
										options={urgencyOptions}
										value={currentUrgency(issue)}
										onselect={(value) => void rate(issue, 'urgency', value)}
										allowClear
										clearLabel="Not assessed"
										disabled={busy}
									/>
								</div>
							</div>
						</li>
					{/each}
				</ul>

				{#if total > issues.length}
					<p class="small text-body-secondary py-2 mb-0 tnum">
						Showing {issues.length} of {total} issues.
					</p>
				{/if}
			</div>
		{/if}
	</ModalBody>
	<ModalFooter>
		<Button id="assessment-close" color="outline-secondary" size="sm" onclick={() => handleOpenChange(false)}>
			Close
		</Button>
	</ModalFooter>
</Modal>

<style>
	.tnum {
		font-variant-numeric: tabular-nums;
	}
</style>
