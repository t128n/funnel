<script lang="ts">
	import { Dialog } from 'bits-ui';
	import Spinner from '#lib/components/common/Spinner.svelte';
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
	<Dialog.Portal>
		<Dialog.Overlay class="overlay" />
		<Dialog.Content class="dialog" aria-describedby={undefined}>
			<Dialog.Title class="dialog__title">
				{isClose ? 'Close issue' : 'Reopen issue'}
			</Dialog.Title>
			<p class="dialog__hint">
				{#if isClose}
					Closing records a resolution. The note is posted as a comment on GitHub
					before the issue is closed.
				{:else}
					Reopening restores the issue. The note is posted as a comment on GitHub
					before it is reopened.
				{/if}
			</p>

			{#if isClose}
				<div class="field">
					<span class="field__label">Resolution</span>
					<div class="segmented" role="radiogroup" aria-label="Resolution">
						<label
							class="segmented__option"
							class:segmented__option--active={reason === 'completed'}
						>
							<input
								type="radio"
								name="resolution"
								value="completed"
								checked={reason === 'completed'}
								onchange={() => (reason = 'completed')}
							/>
							Completed
						</label>
						<label
							class="segmented__option"
							class:segmented__option--active={reason === 'not_planned'}
						>
							<input
								type="radio"
								name="resolution"
								value="not_planned"
								checked={reason === 'not_planned'}
								onchange={() => (reason = 'not_planned')}
							/>
							Not planned
						</label>
					</div>
				</div>
			{/if}

			<label class="field">
				<span class="field__label">
					{isClose ? 'Resolution note' : 'Reopen note'}
					<span class="field__required">required</span>
				</span>
				<textarea
					class="field__input"
					rows="4"
					placeholder={isClose ? 'What resolved this issue?' : 'Why is this being reopened?'}
					value={note}
					oninput={(e) => (note = e.currentTarget.value)}
				></textarea>
			</label>

			{#if error}
				<div class="dialog__error">{error}</div>
			{/if}

			<div class="dialog__actions">
				<button class="btn" type="button" onclick={() => onopenchange(false)} disabled={busy}>
					Cancel
				</button>
				<button class="btn btn--primary" type="button" onclick={confirm} disabled={!canConfirm}>
					{#if busy}<Spinner size={13} />{/if}
					{isClose ? 'Close issue' : 'Reopen issue'}
				</button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.overlay) {
		position: fixed;
		inset: 0;
		z-index: 70;
		background: color-mix(in srgb, #000 55%, transparent);
	}

	:global(.dialog) {
		position: fixed;
		top: 50%;
		left: 50%;
		z-index: 71;
		transform: translate(-50%, -50%);
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		width: min(440px, calc(100vw - var(--space-xl)));
		padding: var(--space-lg);
		background: var(--color-surface-layer-1);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-overlay);
	}

	:global(.dialog__title) {
		margin: 0;
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		color: var(--color-text-primary);
	}

	.dialog__hint {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.5;
		color: var(--color-text-muted);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	.field__label {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-muted);
	}

	.field__required {
		font-weight: var(--weight-regular);
		text-transform: none;
		letter-spacing: 0;
		color: var(--color-accent-amber);
	}

	.segmented {
		display: flex;
		gap: var(--space-xs);
	}

	.segmented__option {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		flex: 1;
		padding: var(--space-sm);
		background: var(--color-surface-layer-2);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		cursor: pointer;
	}

	.segmented__option--active {
		border-color: var(--color-primary);
		color: var(--color-text-primary);
	}

	.segmented__option input {
		margin: 0;
	}

	.field__input {
		width: 100%;
		padding: var(--space-sm);
		background: var(--color-surface-layer-2);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-sm);
		font-family: var(--font-sans);
		font-size: var(--text-base);
		line-height: 1.5;
		color: var(--color-text-primary);
		resize: vertical;
	}

	.dialog__error {
		padding: var(--space-sm);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		background: color-mix(in srgb, var(--color-accent-red) 14%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-accent-red) 40%, transparent);
		color: var(--color-accent-red);
	}

	.dialog__actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-sm);
	}

	.btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		height: 28px;
		padding: 0 var(--space-md);
		background: var(--color-surface-layer-2);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		color: var(--color-text-primary);
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.btn--primary {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: var(--color-on-primary);
		font-weight: var(--weight-medium);
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
