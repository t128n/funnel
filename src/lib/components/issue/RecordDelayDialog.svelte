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
	import Spinner from '#lib/components/common/Spinner.svelte';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import {
		DELAY_REASONS,
		type DelayReason
	} from '#lib/funnel-metadata';
	import { delayReasonLabel, isDelayReason, localToIso } from './inspector-format';

	/** Record a manual delay interval (SPEC §2, §5). */
	interface Props {
		open: boolean;
		repo: string;
		number: number;
		onopenchange: (open: boolean) => void;
	}

	let { open, repo, number, onopenchange }: Props = $props();

	let reason = $state<DelayReason | ''>('');
	let started = $state('');
	let ended = $state('');
	let note = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);

	function toLocalInput(date: Date): string {
		const pad = (value: number) => String(value).padStart(2, '0');
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
			date.getHours()
		)}:${pad(date.getMinutes())}`;
	}

	$effect(() => {
		if (open) {
			reason = '';
			started = toLocalInput(new Date());
			ended = '';
			note = '';
			error = null;
			busy = false;
		}
	});

	const startIso = $derived(localToIso(started));
	const endIso = $derived(ended.trim().length > 0 ? localToIso(ended) : null);
	const canConfirm = $derived(
		!busy &&
			isDelayReason(reason) &&
			startIso !== null &&
			(ended.trim().length === 0 || endIso !== null) &&
			(endIso === null || startIso === null || Date.parse(endIso) >= Date.parse(startIso))
	);

	async function confirm(): Promise<void> {
		if (!canConfirm || !isDelayReason(reason) || startIso === null) return;
		busy = true;
		error = null;
		const slash = repo.indexOf('/');
		const owner = slash > 0 ? repo.slice(0, slash) : repo;
		const name = slash > 0 ? repo.slice(slash + 1) : '';
		try {
			const response = await fetch(
				`/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues/${number}/delays`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						reason,
						started_at: startIso,
						...(endIso !== null ? { ended_at: endIso } : {}),
						...(note.trim().length > 0 ? { note: note.trim() } : {})
					})
				}
			);
			if (!response.ok) {
				const payload = (await response.json().catch(() => null)) as {
					message?: string;
				} | null;
				error = payload?.message ?? 'Could not record the delay.';
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

	function close(next: boolean): void {
		if (!busy) onopenchange(next);
	}
</script>

<Modal isOpen={open} toggle={() => close(false)} labelledBy="record-delay-title">
	<ModalHeader toggle={() => close(false)} id="record-delay-title">Record delay</ModalHeader>

	<ModalBody>
		<p class="text-body-secondary small">
			Manual delays are local to Funnel. They may overlap a blocked delay; total delay time is
			the union of the intervals.
		</p>

		<div class="d-flex flex-column gap-3">
			<FormGroup class="mb-0">
				<Label for="delay-reason">
					Reason <span class="fw-normal text-danger">required</span>
				</Label>
				<select id="delay-reason" class="form-select" bind:value={reason}>
					<option value="">Select a reason</option>
					{#each DELAY_REASONS as value (value)}
						<option {value}>{delayReasonLabel(value)}</option>
					{/each}
				</select>
			</FormGroup>

			<FormGroup class="mb-0">
				<Label for="delay-start">
					Started <span class="fw-normal text-danger">required</span>
				</Label>
				<Input id="delay-start" type="datetime-local" bind:value={started} />
			</FormGroup>

			<FormGroup class="mb-0">
				<Label for="delay-end">Ended</Label>
				<Input id="delay-end" type="datetime-local" bind:value={ended} />
			</FormGroup>

			<FormGroup class="mb-0">
				<Label for="delay-note">Note</Label>
				<textarea id="delay-note" class="form-control" rows="2" bind:value={note}></textarea>
			</FormGroup>

			{#if error}
				<InlineStatus tone="error" message={error} />
			{/if}
		</div>
	</ModalBody>

	<ModalFooter>
		<Button color="secondary" outline type="button" disabled={busy} onclick={() => close(false)}>
			Cancel
		</Button>
		<Button
			color="primary"
			onclick={confirm}
			disabled={!canConfirm}
			style="min-width: 7rem"
		>
			{#if busy}
				<Spinner size={13} class="me-1" />
			{/if}
			{busy ? 'Recording…' : 'Record delay'}
		</Button>
	</ModalFooter>
</Modal>
