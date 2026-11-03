<script lang="ts">
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
	import Spinner from '#lib/components/common/Spinner.svelte';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import { quickRecheckDates, toISODate } from '#lib/attention';
	import { clockTick } from '#lib/client/clock.svelte';
	import type { BlockPayload } from '#lib/client/issue-actions.svelte';
	import {
		DELAY_REASONS,
		type BlockInfo,
		type DelayReason
	} from '#lib/funnel-metadata';
	import {
		blockInfoPayload,
		canSubmitBlock,
		delayReasonLabel
	} from '#lib/components/issue/inspector-format';

	/**
	 * Structured block/unblock dialog (SPEC §5.1). Blocking records *why* an
	 * issue is stuck — the blocked-by description, the next step, what is being
	 * tried, and an optional re-check date — as a comment and in the body's
	 * metadata envelope. Unblocking requires the resolution note. The caller
	 * performs the writes and closes the dialog on success.
	 */
	interface Props {
		open: boolean;
		mode: 'block' | 'unblock';
		busy?: boolean;
		error?: string | null;
		/** Existing block fields to prefill, e.g. when revising a blocked issue. */
		initial?: Partial<BlockInfo>;
		onopenchange: (open: boolean) => void;
		onconfirm: (payload: BlockPayload) => void;
	}

	let { open, mode, busy = false, error = null, initial, onopenchange, onconfirm }: Props = $props();

	const isBlock = $derived(mode === 'block');

	let blocker = $state('');
	let needs = $state('');
	let trying = $state('');
	let recheck = $state('');
	let note = $state('');
	let reason = $state<DelayReason | ''>('');

	// Reset each time the dialog (re)opens so a cancelled action never leaks
	// stale fields into the next one. `initial` prefills a revise-in-place flow.
	$effect(() => {
		if (open) {
			blocker = initial?.blocker ?? '';
			needs = initial?.needs ?? '';
			trying = initial?.trying ?? '';
			recheck = initial?.recheck ?? '';
			reason = initial?.reason ?? '';
			note = '';
		}
	});

	const canConfirm = $derived(
		!busy &&
			(isBlock
				? canSubmitBlock({ blocker, needs, reason })
				: note.trim().length > 0)
	);

	/** Revising an existing block (attention row) rewrites its metadata envelope. */
	const revising = $derived(isBlock && Boolean(initial?.blocker));

	// Quick re-check anchors relative to the browser's "today" (re-evaluated on
	// the shared clock).
	const today = $derived.by(() => {
		clockTick();
		return toISODate(new Date());
	});
	const quickDates = $derived(quickRecheckDates(today));

	function close() {
		if (!busy) onopenchange(false);
	}

	function confirm() {
		if (!canConfirm) return;
		if (isBlock) {
			const info = blockInfoPayload({ blocker, needs, trying, recheck, reason });
			if (!info) return;
			onconfirm({ kind: 'block', info });
		} else {
			onconfirm({ kind: 'unblock', note: note.trim() });
		}
	}
</script>

<Modal isOpen={open} toggle={close} size="lg">
	<ModalHeader toggle={close}>
		{isBlock ? (revising ? 'Update block' : 'Block issue') : 'Unblock issue'}
	</ModalHeader>

	<ModalBody>
		<p class="small text-body-secondary">
			{#if revising}
				Revising why the issue is still blocked and when to re-check it. The summary is posted
				as a comment and replaces the issue's stored blocker metadata.
			{:else if isBlock}
				Recording what is blocking the issue and what needs to happen next. The summary is
				posted as a comment and stored in the issue's metadata.
			{:else}
				Record what unblocked the issue. The note is posted as a comment and clears the
				structured blocker metadata.
			{/if}
		</p>

		{#if isBlock}
			<div class="d-flex flex-column gap-3">
				<FormGroup class="mb-0">
					<Label for="blocker">
						Blocker <span class="fw-normal text-danger">required</span>
					</Label>
					<textarea
						id="blocker"
						class="form-control"
						rows="2"
						placeholder="What is blocking this issue?"
						value={blocker}
						oninput={(event) => (blocker = event.currentTarget.value)}
					></textarea>
				</FormGroup>

				<FormGroup class="mb-0">
					<Label for="block-reason">
						Reason <span class="fw-normal text-danger">required</span>
					</Label>
					<select id="block-reason" class="form-select" bind:value={reason}>
						<option value="">Select a reason</option>
						{#each DELAY_REASONS as value (value)}
							<option {value}>{delayReasonLabel(value)}</option>
						{/each}
					</select>
				</FormGroup>

				<FormGroup class="mb-0">
					<Label for="needs">
						Needs to unblock <span class="fw-normal text-danger">required</span>
					</Label>
					<textarea
						id="needs"
						class="form-control"
						rows="2"
						placeholder="The concrete step that must happen to unblock it"
						value={needs}
						oninput={(event) => (needs = event.currentTarget.value)}
					></textarea>
				</FormGroup>

				<FormGroup class="mb-0">
					<Label for="trying">Currently trying</Label>
					<textarea
						id="trying"
						class="form-control"
						rows="2"
						placeholder="Optional: what is being attempted in the meantime"
						value={trying}
						oninput={(event) => (trying = event.currentTarget.value)}
					></textarea>
				</FormGroup>

				<FormGroup class="mb-0">
					<Label for="recheck">Re-check date</Label>
					<div class="d-flex flex-column gap-2">
						<Input id="recheck" type="date" bind:value={recheck} class="block-recheck" />
						<div class="d-flex flex-wrap align-items-center gap-1">
							{#each quickDates as option (option.label)}
								<Button
									type="button"
									color="outline-secondary"
									size="sm"
									active={recheck === option.value}
									title={option.value}
									aria-pressed={recheck === option.value}
									onclick={() => (recheck = option.value)}
								>
									{option.label}
								</Button>
							{/each}
						</div>
					</div>
				</FormGroup>
			</div>
		{:else}
			<FormGroup class="mb-0">
				<Label for="unblock-note">
					What unblocked it <span class="fw-normal text-danger">required</span>
				</Label>
				<textarea
					id="unblock-note"
					class="form-control"
					rows="4"
					placeholder="What changed to unblock this issue?"
					value={note}
					oninput={(event) => (note = event.currentTarget.value)}
				></textarea>
			</FormGroup>
		{/if}

		{#if error}
			<div class="mt-3">
				<InlineStatus tone="error" message={error} />
			</div>
		{/if}
	</ModalBody>

	<ModalFooter>
		<Button color="secondary" outline type="button" disabled={busy} onclick={close}>Cancel</Button>
		<Button color="primary" onclick={confirm} disabled={!canConfirm}>
			{#if busy}
				<span class="d-inline-flex align-items-center me-2">
					<Spinner size={13} />
				</span>
			{/if}
			{isBlock ? (revising ? 'Update block' : 'Block issue') : 'Unblock issue'}
		</Button>
	</ModalFooter>
</Modal>

<style>
	:global(.block-recheck) {
		width: 10rem;
	}
</style>
