<script lang="ts">
	import Spinner from '#lib/components/common/Spinner.svelte';
	import * as Alert from '#lib/components/primitives/alert';
	import { Button } from '#lib/components/primitives/button';
	import * as Dialog from '#lib/components/primitives/dialog';
	import * as Field from '#lib/components/primitives/field';
	import { Textarea } from '#lib/components/primitives/textarea';
	import type { CloseReason } from '#lib/client/mutations';

	/**
	 * SNOW-style structured close/reopen dialog (SPEC §5.2.3). Closing requires a
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
			<Dialog.Title>
				{isClose ? 'Close issue' : 'Reopen issue'}
			</Dialog.Title>
			<Dialog.Description>
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
						<Field.Label variant="choice" class="flex-1 gap-2">
							<input
								type="radio"
								name="resolution"
								value="completed"
								checked={reason === 'completed'}
								onchange={() => (reason = 'completed')}
							/>
							<span>Completed</span>
						</Field.Label>
						<Field.Label variant="choice" class="flex-1 gap-2">
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
					<span class="text-destructive font-normal">required</span>
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
			<Alert.Root variant="destructive">
				<Alert.Description>{error}</Alert.Description>
			</Alert.Root>
		{/if}

		<Dialog.Footer>
			<Dialog.Close type="button">
				{#snippet child({ props })}
					<Button variant="outline" {...props} type="button" disabled={busy}>Cancel</Button>
				{/snippet}
			</Dialog.Close>
			<Button onclick={confirm} disabled={!canConfirm}>
				{#if busy}
					<span data-icon="inline-start" class="inline-flex items-center">
						<Spinner size={13} />
					</span>
				{/if}
				{isClose ? 'Close issue' : 'Reopen issue'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
