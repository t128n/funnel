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
	import {
		addChildRequest,
		epicChildErrorMessage,
		type EpicCandidate
	} from './epic-actions';

	/**
	 * Search open issues and add one child to the epic. The API replaces the
	 * whole ordered list, so submitting sends the existing refs plus the choice
	 * — including any unavailable refs the reader cannot resolve.
	 */
	interface Props {
		open: boolean;
		epicRepo: string;
		epicNumber: number;
		/** Existing refs, in written order. */
		children: string[];
		candidates: EpicCandidate[];
		onopenchange: (open: boolean) => void;
	}

	let { open, epicRepo, epicNumber, children, candidates, onopenchange }: Props = $props();

	let query = $state('');
	let selectedRef = $state<string | null>(null);
	let busy = $state(false);
	let error = $state<string | null>(null);

	const selected = $derived(
		candidates.find((candidate) => candidate.ref === selectedRef) ?? null
	);
	const filtered = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		if (needle.length === 0) return candidates;
		return candidates.filter(
			(candidate) =>
				candidate.title.toLowerCase().includes(needle) ||
				candidate.repo.toLowerCase().includes(needle) ||
				candidate.ref.toLowerCase().includes(needle)
		);
	});

	$effect(() => {
		if (open) {
			query = '';
			selectedRef = null;
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
		const request = addChildRequest(epicRepo, epicNumber, children, selected.ref);
		try {
			const response = await fetch(request.url, {
				method: request.method,
				headers: { 'Content-Type': 'application/json' },
				body: request.body
			});
			if (!response.ok) {
				const payload = await response.json().catch(() => null);
				error = epicChildErrorMessage(response.status, payload);
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

<Modal isOpen={open} toggle={() => close(false)} size="lg">
	<ModalHeader toggle={() => close(false)}>Add child</ModalHeader>
	<ModalBody>
		<p class="small text-body-secondary">
			Choose an open issue to add to this epic. Only issues that are not already in another epic
			are listed.
		</p>

		<div class="d-flex flex-column gap-3">
			<FormGroup>
				<Label for="epic-candidate-search">Find an issue</Label>
				<Input
					id="epic-candidate-search"
					type="search"
					placeholder="Search by title, repo or number"
					bind:value={query}
					autocomplete="off"
				/>
			</FormGroup>

			{#if candidates.length === 0}
				<EmptyState
					description="No open issues are available. Create an issue or remove it from another epic first."
					class="border-top border-bottom"
				/>
			{:else if filtered.length === 0}
				<p class="py-2 text-body-secondary">No issue matches “{query}”.</p>
			{:else}
				<div
					class="list-group list-group-flush overflow-auto border-top border-bottom"
					style="max-height: 16rem"
					role="group"
					aria-label="Epic candidates"
				>
					{#each filtered as candidate (candidate.ref)}
						<button
							type="button"
							class="list-group-item list-group-item-action d-flex align-items-center gap-2 px-3 py-1 text-start text-body"
							class:bg-body-secondary={selectedRef === candidate.ref}
							aria-pressed={selectedRef === candidate.ref}
							onclick={() => {
								selectedRef = candidate.ref;
								error = null;
							}}
						>
							<span class="flex-shrink-0 text-primary" style="width: 1rem">
								{#if selectedRef === candidate.ref}
									<i class="bi bi-check-lg" aria-hidden="true"></i>
								{/if}
							</span>
							<span class="font-monospace flex-shrink-0 text-body-secondary">
								{candidate.repo}#{candidate.number}
							</span>
							<span class="min-w-0 flex-grow-1 text-truncate">{candidate.title}</span>
						</button>
					{/each}
				</div>
			{/if}

			{#if error}
				<div data-testid="epic-child-error">
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
				<Spinner label="Adding child" />
			{/if}
			{busy ? 'Adding…' : 'Add child'}
		</Button>
	</ModalFooter>
</Modal>
