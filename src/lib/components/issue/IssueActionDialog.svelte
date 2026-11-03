<script lang="ts">
	import {
		Button,
		Modal,
		ModalBody,
		ModalFooter,
		ModalHeader
	} from '@sveltestrap/sveltestrap';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
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

	function close() {
		if (!busy) onopenchange(false);
	}

	function confirm() {
		if (!canConfirm) return;
		onconfirm({ reason, note: note.trim() });
	}
</script>

<Modal isOpen={open} toggle={close} labelledBy="issue-action-title">
	<ModalHeader toggle={close} id="issue-action-title">
		{isClose ? 'Close issue' : 'Reopen issue'}
	</ModalHeader>

	<ModalBody>
		<p class="text-body-secondary">
			{#if isClose}
				Closing records a resolution. The note is posted as a comment on GitHub before the
				issue is closed.
			{:else}
				Reopening restores the issue. The note is posted as a comment on GitHub before it is
				reopened.
			{/if}
		</p>

		{#if isClose}
			<fieldset class="mb-3">
				<legend class="form-label fs-6 mb-2">Resolution</legend>
				<div class="d-flex flex-wrap gap-4" role="radiogroup" aria-label="Resolution">
					<div class="form-check">
						<input
							class="form-check-input"
							type="radio"
							name="resolution"
							id="resolution-completed"
							value="completed"
							checked={reason === 'completed'}
							onchange={() => (reason = 'completed')}
						/>
						<label class="form-check-label" for="resolution-completed">Completed</label>
					</div>
					<div class="form-check">
						<input
							class="form-check-input"
							type="radio"
							name="resolution"
							id="resolution-not-planned"
							value="not_planned"
							checked={reason === 'not_planned'}
							onchange={() => (reason = 'not_planned')}
						/>
						<label class="form-check-label" for="resolution-not-planned">Not planned</label>
					</div>
				</div>
			</fieldset>
		{/if}

		<div class="mb-3">
			<label class="form-label" for="resolve-note">
				{isClose ? 'Resolution note' : 'Reopen note'}
				<span class="fw-normal text-danger">required</span>
			</label>
			<textarea
				id="resolve-note"
				class="form-control"
				rows={4}
				placeholder={isClose ? 'What resolved this issue?' : 'Why is this being reopened?'}
				value={note}
				oninput={(e) => (note = e.currentTarget.value)}
			></textarea>
		</div>

		{#if error}
			<InlineStatus tone="error" message={error} />
		{/if}
	</ModalBody>

	<ModalFooter>
		<Button color="secondary" outline onclick={close} disabled={busy}>Cancel</Button>
		<Button color="primary" onclick={confirm} disabled={!canConfirm}>
			{#if busy}
				<Spinner size={13} class="me-2" />
			{/if}
			{busy
				? isClose
					? 'Closing…'
					: 'Reopening…'
				: isClose
					? 'Close issue'
					: 'Reopen issue'}
		</Button>
	</ModalFooter>
</Modal>
