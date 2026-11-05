<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { untrack } from 'svelte';
	import {
		Button,
		FormCheck,
		FormGroup,
		FormText,
		Input,
		Label,
		Table
	} from '@sveltestrap/sveltestrap';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import Section from '#lib/components/settings/section.svelte';
	import SettingsForm from '#lib/components/settings/settings-form.svelte';
	import type { SettingsFormResult } from '#lib/components/settings/sections';
	import { absoluteDateTime, absoluteTime, relativeTime } from '#lib/time';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const initial = untrack(() => data.sync);
	let historyDays = $state<number | null>(initial.history_days);
	let activeSeconds = $state<number | null>(initial.poll_interval_active_seconds);
	let idleSeconds = $state<number | null>(initial.poll_interval_idle_seconds);
	let prInReview = $state(initial.pr_in_review);
	let prDone = $state(initial.pr_done);

	const status = $derived(data.status);
	const degraded = $derived(status.repos.filter((repo) => repo.degraded));

	let syncing = $state(false);
	let syncMessage = $state<{ tone: 'success' | 'error'; text: string } | null>(null);

	const payload = $derived(
		JSON.stringify({
			sync: {
				history_days: historyDays,
				poll_interval_active_seconds: activeSeconds,
				poll_interval_idle_seconds: idleSeconds,
				pr_in_review: prInReview,
				pr_done: prDone
			}
		})
	);

	function timeTitle(at: number): string {
		return absoluteTime(at);
	}

	/**
	 * Manual cycles return a `syncError` instead of `message` so the shared
	 * settings form does not mistake a sync failure for a validation summary.
	 */
	function syncFailureMessage(form: unknown): string {
		if (typeof form !== 'object' || form === null || !('syncError' in form)) {
			return 'The sync cycle failed. Check the server log, then retry.';
		}
		const value = (form as { syncError?: unknown }).syncError;
		return typeof value === 'string' && value.length > 0 ? value : 'The sync cycle failed.';
	}
</script>

<div class="d-flex flex-column gap-4">
	{#if status.degradedCount > 0}
		<div class="alert alert-warning mb-0" role="alert">
			<div class="d-flex align-items-start gap-2">
				<i class="bi bi-exclamation-triangle mt-1 flex-shrink-0" aria-hidden="true"></i>
				<div class="min-w-0">
					<p class="fw-semibold mb-1">
						{status.degradedCount === 1
							? 'One repository is degraded'
							: `${status.degradedCount} repositories are degraded`}
					</p>
					<p class="mb-1">
						Sync is failing for
						{#each degraded as repo, index (repo.repo)}
							<span class="font-monospace">{repo.repo}</span>{index < degraded.length - 1
								? ', '
								: '.'}
						{/each}
						The last successful poll is shown below; the failure itself is logged by the sync worker as
						<code>repo poll failed</code>.
					</p>
					<a class="alert-link" href="#sync-repositories">View repository status</a>
				</div>
			</div>
		</div>
	{/if}

	<Section
		title="Repository health"
		description="Last successful poll and nightly reconciliation for every configured repository. Updated when the page loads and after a manual sync."
	>
		{#if status.repos.length === 0}
			<InlineStatus
				tone="info"
				message="No repositories are configured yet. Add one under Settings → Repositories to start syncing."
			/>
		{:else}
			<form
				method="POST"
				action="?/sync"
				class="d-flex flex-wrap align-items-center gap-3"
				use:enhance={() => {
					syncing = true;
					syncMessage = null;
					return async ({ result, update }) => {
						try {
							await update({ reset: false });
							if (result.type === 'success') {
								syncMessage = {
									tone: 'success',
									text: 'Sync cycle finished. The timestamps below are up to date.'
								};
							} else if (result.type === 'failure') {
								syncMessage = { tone: 'error', text: syncFailureMessage(result.data) };
							} else if (result.type === 'error') {
								syncMessage = {
									tone: 'error',
									text: 'The sync cycle could not start. Check the server log, then retry.'
								};
							}
							// A failed action does not invalidate load data, but the
							// attempted cycle may still have updated a repo's timestamps.
							await invalidateAll();
						} finally {
							syncing = false;
						}
					};
				}}
			>
				<Button type="submit" color="primary" disabled={syncing}>
					{#if syncing}
						<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
						Syncing…
					{:else}
						<i class="bi bi-arrow-repeat me-1" aria-hidden="true"></i>
						Sync now
					{/if}
				</Button>
				<span class="small text-body-secondary">
					Runs one cycle for every configured repository. It does not change the polling schedule.
				</span>
			</form>

			{#if syncMessage}
				<InlineStatus tone={syncMessage.tone} message={syncMessage.text} />
			{/if}

			<Table responsive class="table-sm align-middle mb-0" id="sync-repositories">
				<thead>
					<tr>
						<th scope="col">Repository</th>
						<th scope="col">Last poll</th>
						<th scope="col">Last reconcile</th>
						<th scope="col">State</th>
					</tr>
				</thead>
				<tbody>
					{#each status.repos as repo (repo.repo)}
						<tr class={repo.degraded ? 'table-warning' : ''}>
							<th scope="row" class="fw-normal">
								<span class="font-monospace text-break">{repo.repo}</span>
							</th>
							<td>
								{#if repo.lastPolledAt === null}
									<span class="text-body-secondary">Not yet</span>
								{:else}
									<time
										datetime={new Date(repo.lastPolledAt).toISOString()}
										title={timeTitle(repo.lastPolledAt)}
									>
										{relativeTime(repo.lastPolledAt)}
									</time>
									<span class="visually-hidden">({absoluteDateTime(repo.lastPolledAt)})</span>
								{/if}
							</td>
							<td>
								{#if repo.lastReconciledAt === null}
									<span class="text-body-secondary">Not yet</span>
								{:else}
									<time
										datetime={new Date(repo.lastReconciledAt).toISOString()}
										title={timeTitle(repo.lastReconciledAt)}
									>
										{relativeTime(repo.lastReconciledAt)}
									</time>
									<span class="visually-hidden">({absoluteDateTime(repo.lastReconciledAt)})</span>
								{/if}
							</td>
							<td>
								{#if !repo.mirrored}
									<span class="badge text-bg-secondary">Awaiting first sync</span>
								{:else if repo.degraded}
									<span class="badge text-bg-warning">Degraded</span>
								{:else}
									<span class="badge text-bg-success">Healthy</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</Table>
		{/if}
	</Section>

	<SettingsForm form={form as SettingsFormResult | null} {payload}>
		<Section
			title="Polling intervals"
			description="The active interval applies while someone has the cockpit open; the idle interval is the background cadence."
		>
			<div class="row g-3">
				<div class="col-sm-4">
					<FormGroup spacing="">
						<Label for="sync-history-days">History window (days)</Label>
						<Input id="sync-history-days" type="number" min="0" bind:value={historyDays} />
						<FormText>How far back Funnel mirrors issue history.</FormText>
					</FormGroup>
				</div>
				<div class="col-sm-4">
					<FormGroup spacing="">
						<Label for="sync-active-seconds">Active poll (seconds)</Label>
						<Input id="sync-active-seconds" type="number" min="0" bind:value={activeSeconds} />
						<FormText>Cadence while the cockpit is open.</FormText>
					</FormGroup>
				</div>
				<div class="col-sm-4">
					<FormGroup spacing="">
						<Label for="sync-idle-seconds">Idle poll (seconds)</Label>
						<Input id="sync-idle-seconds" type="number" min="0" bind:value={idleSeconds} />
						<FormText>Background cadence with no viewers.</FormText>
					</FormGroup>
				</div>
			</div>
		</Section>
		<Section
			title="Pull request transitions"
			description="Optional automatic status changes from the pull requests linked to an issue. Both are off by default and only write when the issue actually needs to change."
		>
			<div class="d-flex align-items-start justify-content-between gap-3 py-2 border-bottom">
				<div class="min-w-0">
					<div class="fw-medium">Move to In Review when a PR opens</div>
					<div class="small text-body-secondary">
						An open issue with at least one open linked pull request gets the
						configured In Review status label.
					</div>
				</div>
				<FormCheck
					id="sync-pr-in-review"
					type="switch"
					class="flex-shrink-0"
					checked={prInReview}
					on:change={() => (prInReview = !prInReview)}
					aria-label="Move to In Review when a pull request opens"
				/>
			</div>
			<div class="d-flex align-items-start justify-content-between gap-3 pt-2">
				<div class="min-w-0">
					<div class="fw-medium">Close when linked PRs finish</div>
					<div class="small text-body-secondary">
						When every linked pull request is merged or closed, close the open
						issue as completed.
					</div>
				</div>
				<FormCheck
					id="sync-pr-done"
					type="switch"
					class="flex-shrink-0"
					checked={prDone}
					on:change={() => (prDone = !prDone)}
					aria-label="Close the issue when every linked pull request is merged or closed"
				/>
			</div>
		</Section>
	</SettingsForm>
</div>
