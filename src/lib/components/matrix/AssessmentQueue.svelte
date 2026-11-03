<script lang="ts">
	import { tick } from 'svelte';
	import { refreshAll } from '$app/navigation';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import SingleSelect from '#lib/components/common/SingleSelect.svelte';
	import { Button } from '#lib/components/ui/button';
	import * as Dialog from '#lib/components/ui/dialog';
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
	 * It reuses the Inspector's write path and the shared select control. A
	 * completed pair leaves the queue and enters its matrix cell on the next
	 * load; a partial pair keeps the existing axis and stays queued.
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
	let closeRef = $state<HTMLElement | null>(null);

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

	async function rate(
		issue: IssueListItem,
		axis: Axis,
		value: string | null
	): Promise<void> {
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
				queueEl?.querySelector<HTMLElement>(
					'[data-assessment-row] [data-slot="select-trigger"]'
				) ?? closeRef;
			next?.focus();
		}
	}
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
	<Dialog.Content class="sm:max-w-[var(--layout-settings-max)]">
		<Dialog.Header>
			<Dialog.Title>Assessment queue</Dialog.Title>
			<Dialog.Description>
				{#if total === 0}
					Every issue in this scope has an impact and urgency rating.
				{:else}
					{total} {total === 1 ? 'issue needs' : 'issues need'} an impact or urgency
					rating.
				{/if}
			</Dialog.Description>
		</Dialog.Header>

		{#if error}
			<InlineStatus tone="error" message={error} />
		{/if}

		{#if issues.length === 0}
			<p class="text-body text-fg-secondary">No issues awaiting assessment.</p>
		{:else}
			<div
				bind:this={queueEl}
				class="max-h-[var(--layout-matrix-queue-max)] overflow-y-auto overscroll-contain border-t border-border-subtle"
			>
				<ul class="m-0 flex list-none flex-col p-0" aria-label="Issues awaiting assessment">
					{#each issues as issue (`${issue.repoId}:${issue.number}`)}
						{@const ref = `${issue.repo}#${issue.number}`}
						<li
							class="flex flex-col gap-2 border-b border-border-subtle py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
							data-assessment-row
						>
							<div class="min-w-0 flex-1">
								<p class="break-words text-body text-fg">{titleOf(issue)}</p>
								<p class="mono text-caption text-fg-secondary">{ref}</p>
							</div>

							<div class="flex shrink-0 flex-wrap items-start gap-3">
								<div class="flex flex-col gap-1">
									<span class="text-caption text-fg-secondary">Impact</span>
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
								<div class="flex flex-col gap-1">
									<span class="text-caption text-fg-secondary">Urgency</span>
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
					<p class="py-2 text-caption tabular-nums text-fg-secondary">
						Showing {issues.length} of {total} issues.
					</p>
				{/if}
			</div>
		{/if}

		<Dialog.Footer>
			<Button
				bind:ref={closeRef}
				variant="outline"
				size="sm"
				onclick={() => handleOpenChange(false)}
			>
				Close
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
