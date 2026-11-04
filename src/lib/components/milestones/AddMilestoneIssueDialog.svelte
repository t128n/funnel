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
	import { updateIssue } from '#lib/client/mutations';
	import type { IssueListItem } from '#lib/server/issues/types';

	/**
	 * Add an existing open issue to this milestone. Membership is a property of
	 * the issue, so the picker patches `milestone` and reloads the page; removing
	 * an issue is the same property set back to "No milestone" on its detail.
	 */
	interface Props {
		open: boolean;
		repo: string;
		milestoneNumber: number;
		/** Open issues in the repo that do not already have a milestone. */
		candidates: IssueListItem[];
		onopenchange: (open: boolean) => void;
	}

	let { open, repo, milestoneNumber, candidates, onopenchange }: Props = $props();

	let query = $state('');
	let selectedNumber = $state<number | null>(null);
	let busy = $state(false);
	let error = $state<string | null>(null);

	const selected = $derived(
		candidates.find((candidate) => candidate.number === selectedNumber) ?? null
	);
	const filtered = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		if (needle.length === 0) return candidates;
		return candidates.filter(
			(candidate) =>
				candidate.title.toLowerCase().includes(needle) ||
				String(candidate.number).includes(needle)
		);
	});

	$effect(() => {
		if (open) {
			query = '';
			selectedNumber = null;
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
		const result = await updateIssue(repo, selected.number, { milestone: milestoneNumber });
		busy = false;
		if (!result.ok) {
			error = result.error;
			return;
		}
		await invalidateAll();
		onopenchange(false);
	}
</script>

<Modal isOpen={open} toggle={() => close(false)} size="lg">
	<ModalHeader toggle={() => close(false)}>Add issues</ModalHeader>
	<ModalBody>
		<p class="small text-body-secondary">
			Choose an open issue in {repo} that has no milestone. To remove an issue, set its Milestone
			to “No milestone” in the issue's Properties.
		</p>

		<div class="d-flex flex-column gap-3">
			<FormGroup>
				<Label for="milestone-candidate-search">Find an issue</Label>
				<Input
					id="milestone-candidate-search"
					type="search"
					placeholder="Search by title or number"
					bind:value={query}
					autocomplete="off"
				/>
			</FormGroup>

			{#if candidates.length === 0}
				<EmptyState
					description="No open issues without a milestone are available. Create an issue, or clear its milestone on the issue page first."
					class="border-top border-bottom"
				/>
			{:else if filtered.length === 0}
				<p class="py-2 text-body-secondary">No issue matches “{query}”.</p>
			{:else}
				<div
					class="list-group list-group-flush overflow-auto border-top border-bottom"
					style="max-height: 16rem"
					role="group"
					aria-label="Milestone candidates"
				>
					{#each filtered as candidate (candidate.number)}
						<button
							type="button"
							class="list-group-item list-group-item-action d-flex align-items-center gap-2 px-3 py-1 text-start text-body"
							class:bg-body-secondary={selectedNumber === candidate.number}
							aria-pressed={selectedNumber === candidate.number}
							onclick={() => {
								selectedNumber = candidate.number;
								error = null;
							}}
						>
							<span class="flex-shrink-0 text-primary" style="width: 1rem">
								{#if selectedNumber === candidate.number}
									<i class="bi bi-check-lg" aria-hidden="true"></i>
								{/if}
							</span>
							<span class="font-monospace flex-shrink-0 text-body-secondary">
								{repo}#{candidate.number}
							</span>
							<span class="min-w-0 flex-grow-1 text-truncate">{candidate.title}</span>
						</button>
					{/each}
				</div>
			{/if}

			{#if error}
				<div data-testid="milestone-add-error">
					<InlineStatus tone="error" message={error} />
				</div>
			{/if}
		</div>
	</ModalBody>

	<ModalFooter>
		<Button color="outline-secondary" size="sm" disabled={busy} onclick={() => close(false)}>
			Cancel
		</Button>
		<Button
			color="primary"
			size="sm"
			disabled={busy || selected === null}
			onclick={() => void submit()}
		>
			{#if busy}
				<Spinner label="Adding issue" />
			{/if}
			{busy ? 'Adding…' : 'Add to milestone'}
		</Button>
	</ModalFooter>
</Modal>
