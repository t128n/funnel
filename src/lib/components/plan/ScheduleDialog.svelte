<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import {
		Button,
		FormGroup,
		Input,
		Label,
		Modal,
		ModalBody,
		ModalFooter,
		ModalHeader
	} from '@sveltestrap/sveltestrap';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import type { PlanningIssue } from '#lib/server/planning/queries';
	import { scheduleErrorMessage, scheduleRequest } from './schedule';

	/**
	 * Schedule one candidate issue to the week currently in view.
	 *
	 * The dialog owns its request: a successful PUT reloads the page data, while
	 * a 409 keeps the dialog open and shows the server's cap message inline so
	 * the user can pick a smaller issue or a different week.
	 */
	interface Props {
		open: boolean;
		/** Monday `YYYY-MM-DD` of the week receiving the issue. */
		week: string;
		candidates: PlanningIssue[];
		onopenchange: (open: boolean) => void;
	}

	let { open, week, candidates, onopenchange }: Props = $props();

	let query = $state('');
	let selectedKey = $state<string | null>(null);
	let busy = $state(false);
	let error = $state<string | null>(null);

	function issueKey(issue: PlanningIssue): string {
		return `${issue.repo}#${issue.number}`;
	}

	const selected = $derived(
		candidates.find((issue) => issueKey(issue) === selectedKey) ?? null
	);
	const filtered = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		if (needle.length === 0) return candidates;
		return candidates.filter(
			(issue) =>
				issue.title.toLowerCase().includes(needle) ||
				issue.repo.toLowerCase().includes(needle) ||
				String(issue.number).includes(needle)
		);
	});

	// Every open starts clean: a previous 409 must not leak into the next issue.
	$effect(() => {
		if (open) {
			query = '';
			selectedKey = null;
			error = null;
			busy = false;
		}
	});

	function close(next: boolean) {
		if (busy) return;
		onopenchange(next);
	}

	async function submit() {
		if (selected === null || busy) return;
		busy = true;
		error = null;
		const request = scheduleRequest(selected.repo, selected.number, week);
		try {
			const response = await fetch(request.url, {
				method: request.method,
				headers: { 'Content-Type': 'application/json' },
				body: request.body
			});
			if (response.status === 409) {
				const payload = await response.json().catch(() => null);
				error = scheduleErrorMessage(409, payload);
				return;
			}
			if (!response.ok) {
				const payload = await response.json().catch(() => null);
				error = scheduleErrorMessage(response.status, payload);
				return;
			}
			await invalidateAll();
			onopenchange(false);
		} catch {
			error = 'Could not reach the server. Check the connection and try again.';
		} finally {
			busy = false;
		}
	}
</script>

<Modal isOpen={open} toggle={() => close(false)} size="lg" scrollable>
	<ModalHeader toggle={() => close(false)}>Schedule Issue</ModalHeader>

	<ModalBody>
		<p class="text-body-secondary">
			Add an open, sized issue to the week of {week}. GitHub sizes and assignees stay the
			source of truth.
		</p>

		<div class="d-flex min-w-0 flex-column gap-3">
			<FormGroup class="mb-0">
				<Label for="plan-candidate-search">Find an issue</Label>
				<Input
					id="plan-candidate-search"
					type="search"
					placeholder="Search by title, repo or number"
					bind:value={query}
					autocomplete="off"
				/>
				<div class="form-text">Showing open, sized issues that are not already planned.</div>
			</FormGroup>

			{#if candidates.length === 0}
				<EmptyState
					title="No candidates."
					description="No open, sized issues are available. Estimate and triage an issue first."
					class="border-top border-bottom py-3"
				/>
			{:else if filtered.length === 0}
				<p class="border-top border-bottom py-2 text-body text-body-secondary mb-0">
					No issue matches “{query}”.
				</p>
			{:else}
				<ul
					class="candidate-list list-group list-group-flush overflow-y-auto border-top border-bottom"
					aria-label="Schedule candidates"
				>
					{#each filtered as issue (issueKey(issue))}
						<li>
							<button
								type="button"
								class="candidate-row list-group-item list-group-item-action d-flex w-100 min-w-0 align-items-center gap-2 px-2 text-start"
								aria-pressed={selectedKey === issueKey(issue)}
								onclick={() => {
									selectedKey = issueKey(issue);
									error = null;
								}}
							>
								<span class="font-monospace flex-shrink-0 small text-body-secondary tnum">
									{issue.repo}#{issue.number}
								</span>
								<span class="min-w-0 flex-grow-1 text-truncate text-body">{issue.title}</span>
								<span class="flex-shrink-0 small text-body-secondary">
									{issue.size?.toUpperCase() ?? '—'}
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}

			{#if error}
				<div data-testid="schedule-error">
					<InlineStatus tone="error" message={error} />
				</div>
			{/if}
		</div>
	</ModalBody>

	<ModalFooter>
		<Button color="secondary" outline size="sm" disabled={busy} onclick={() => close(false)}>
			Cancel
		</Button>
		<Button color="primary" size="sm" disabled={busy || selected === null} onclick={() => void submit()}>
			{#if busy}
				<span class="d-inline-flex align-items-center me-2">
					<Spinner />
				</span>
				<span>Scheduling…</span>
			{:else}
				<span>Schedule Issue</span>
			{/if}
		</Button>
	</ModalFooter>
</Modal>

<style>
	.candidate-list {
		max-height: 16rem;
	}

	.candidate-row {
		min-height: var(--funnel-row-compact);
	}

	.candidate-row[aria-pressed='true'] {
		background: var(--bs-secondary-bg);
	}

	.tnum {
		font-variant-numeric: tabular-nums;
	}
</style>
