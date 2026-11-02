<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import CheckIcon from '@lucide/svelte/icons/check';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import { Button } from '#lib/components/ui/button';
	import * as Dialog from '#lib/components/ui/dialog';
	import * as Field from '#lib/components/ui/field';
	import { Input } from '#lib/components/ui/input';
	import { cn } from '#lib/utils';
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

<Dialog.Root {open} onOpenChange={close}>
	<Dialog.Content class="sm:max-w-(--layout-form-max)" aria-describedby={undefined}>
		<Dialog.Header>
			<Dialog.Title>Add child</Dialog.Title>
			<Dialog.Description>
				Open issues that are not already in another epic. The full child list is written to the
				epic issue body.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-3">
			<Field.Field>
				<Field.Label for="epic-candidate-search">Find an issue</Field.Label>
				<Input
					id="epic-candidate-search"
					type="search"
					placeholder="Search by title, repo or number"
					bind:value={query}
					autocomplete="off"
				/>
			</Field.Field>

			{#if candidates.length === 0}
				<EmptyState
					description="No open issues are available. Create an issue or remove it from another epic first."
					class="border-y border-border-subtle py-8"
				/>
			{:else if filtered.length === 0}
				<p class="py-3 text-body text-fg-secondary">No issue matches “{query}”.</p>
			{:else}
				<ul
					class="max-h-64 overflow-y-auto border-y border-border-subtle"
					aria-label="Epic candidates"
				>
					{#each filtered as candidate (candidate.ref)}
						<li>
							<button
								type="button"
								class={cn(
									'candidate flex min-h-(--size-row-compact) w-full min-w-0 items-center gap-2 border-b border-border-subtle px-3 py-1 text-start text-body last:border-b-0',
									selectedRef === candidate.ref && 'bg-surface-2'
								)}
								aria-pressed={selectedRef === candidate.ref}
								onclick={() => {
									selectedRef = candidate.ref;
									error = null;
								}}
							>
								<span class="w-(--icon-sm) shrink-0 text-primary">
									{#if selectedRef === candidate.ref}
										<CheckIcon class="size-(--icon-sm)" aria-hidden="true" />
									{/if}
								</span>
								<span class="mono shrink-0 text-fg-secondary">
									{candidate.repo}#{candidate.number}
								</span>
								<span class="min-w-0 flex-1 truncate">{candidate.title}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}

			{#if error}
				<div data-testid="epic-child-error">
					<InlineStatus tone="error" message={error} />
				</div>
			{/if}
		</div>

		<Dialog.Footer>
			<Button variant="outline" disabled={busy} onclick={() => close(false)}>Cancel</Button>
			<Button disabled={busy || selected === null} onclick={() => void submit()}>
				{#if busy}
					<Spinner label="Adding child" />
				{/if}
				{busy ? 'Adding…' : 'Add child'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<style>
	@media (hover: hover) and (pointer: fine) {
		.candidate:not([aria-pressed='true']):hover {
			background: var(--color-surface);
		}
	}
</style>
