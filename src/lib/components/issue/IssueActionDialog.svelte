<script lang="ts">
	import Spinner from '#lib/components/common/Spinner.svelte';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import { Button } from '#lib/components/ui/button';
	import * as Dialog from '#lib/components/ui/dialog';
	import * as Field from '#lib/components/ui/field';
	import { Textarea } from '#lib/components/ui/textarea';
	import type { CloseReason } from '#lib/client/mutations';

	/**
	 * Structured close/reopen dialog (SPEC §5.2.3). Closing requires a
	 * resolution (Completed / Not planned -> GitHub `state_reason`) and a note;
	 * reopening requires a note. The caller performs the mutation (comment first,
	 * then the state change) and closes the dialog on success.
	 */
	interface Props {
		open: boolean;
		mode: 'close' | 'reopen';
		busy?: boolean;
		error?: string | null;
		onopenchange: (open: boolean) => void;
		onconfirm: (payload: { reason: CloseReason; note: string }) => void;
	}

	let { open, mode, busy = false, error = null, onopenchange, onconfirm }: Props = $props();

	const isClose = $derived(mode === 'close');

	let reason = $state<CloseReason>('completed');
	let note = $state('');

	// Reset the structured fields each time the dialog (re)opens so a cancelled
	// action never leaks a stale note into the next one.
	$effect(() => {
		if (open) {
			reason = 'completed';
			note = '';
		}
	});

	const canConfirm = $derived(note.trim().length > 0 && !busy);

	function confirm() {
		if (!canConfirm) return;
		onconfirm({ reason, note: note.trim() });
	}
</script>

<Dialog.Root
	{open}
	onOpenChange={(next) => {
		if (!busy) onopenchange(next);
	}}
>
	<Dialog.Content aria-describedby={undefined} class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title class="text-heading-sm font-semibold">
				{isClose ? 'Close issue' : 'Reopen issue'}
			</Dialog.Title>
			<Dialog.Description class="text-body text-fg-secondary">
				{#if isClose}
					Closing records a resolution. The note is posted as a comment on GitHub before the
					issue is closed.
				{:else}
					Reopening restores the issue. The note is posted as a comment on GitHub before it is
					reopened.
				{/if}
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-4">
			{#if isClose}
				<Field.Set>
					<Field.Legend variant="label">Resolution</Field.Legend>
					<div class="flex gap-2" role="radiogroup" aria-label="Resolution">
						<Field.Label
							class="flex flex-1 cursor-pointer flex-row items-center gap-2 rounded-sm border border-border-strong p-2 text-body font-normal has-[:checked]:border-primary has-[:checked]:bg-surface-2"
						>
							<input
								type="radio"
								name="resolution"
								value="completed"
								checked={reason === 'completed'}
								onchange={() => (reason = 'completed')}
							/>
							<span>Completed</span>
						</Field.Label>
						<Field.Label
							class="flex flex-1 cursor-pointer flex-row items-center gap-2 rounded-sm border border-border-strong p-2 text-body font-normal has-[:checked]:border-primary has-[:checked]:bg-surface-2"
						>
							<input
								type="radio"
								name="resolution"
								value="not_planned"
								checked={reason === 'not_planned'}
								onchange={() => (reason = 'not_planned')}
							/>
							<span>Not planned</span>
						</Field.Label>
					</div>
				</Field.Set>
			{/if}

			<Field.Field>
				<Field.Label for="resolve-note">
					{isClose ? 'Resolution note' : 'Reopen note'}
					<span class="font-normal text-error">required</span>
				</Field.Label>
				<Textarea
					id="resolve-note"
					rows={4}
					placeholder={isClose ? 'What resolved this issue?' : 'Why is this being reopened?'}
					value={note}
					oninput={(e) => (note = e.currentTarget.value)}
				></Textarea>
			</Field.Field>
		</div>

		{#if error}
			<InlineStatus tone="error" message={error} />
		{/if}

		<Dialog.Footer>
			<Dialog.Close type="button">
				{#snippet child({ props })}
					<Button variant="outline" {...props} type="button" disabled={busy}>Cancel</Button>
				{/snippet}
			</Dialog.Close>
			<Button onclick={confirm} disabled={!canConfirm} class="min-w-28">
				{#if busy}
					<Spinner size={13} />
				{/if}
				{busy
					? isClose
						? 'Closing…'
						: 'Reopening…'
					: isClose
						? 'Close issue'
						: 'Reopen issue'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
