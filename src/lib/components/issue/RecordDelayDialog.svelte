<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import { Button } from '#lib/components/ui/button';
	import * as Dialog from '#lib/components/ui/dialog';
	import * as Field from '#lib/components/ui/field';
	import { Input } from '#lib/components/ui/input';
	import * as NativeSelect from '#lib/components/ui/native-select';
	import { Textarea } from '#lib/components/ui/textarea';
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

<Dialog.Root {open} onOpenChange={close}>
	<Dialog.Content aria-describedby={undefined} class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title class="text-heading-sm font-semibold">Record delay</Dialog.Title>
			<Dialog.Description class="text-body text-fg-secondary">
				Manual delays are local to Funnel. They may overlap a blocked delay; total delay time
				is the union of the intervals.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-4">
			<Field.Field>
				<Field.Label for="delay-reason">
					Reason <span class="font-normal text-error">required</span>
				</Field.Label>
				<NativeSelect.Root id="delay-reason" bind:value={reason}>
					<NativeSelect.Option value="">Select a reason</NativeSelect.Option>
					{#each DELAY_REASONS as value (value)}
						<NativeSelect.Option {value}>{delayReasonLabel(value)}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			</Field.Field>

			<Field.Field>
				<Field.Label for="delay-start">
					Started <span class="font-normal text-error">required</span>
				</Field.Label>
				<Input id="delay-start" type="datetime-local" bind:value={started} />
			</Field.Field>

			<Field.Field>
				<Field.Label for="delay-end">Ended</Field.Label>
				<Input id="delay-end" type="datetime-local" bind:value={ended} />
			</Field.Field>

			<Field.Field>
				<Field.Label for="delay-note">Note</Field.Label>
				<Textarea id="delay-note" rows={2} bind:value={note}></Textarea>
			</Field.Field>

			{#if error}
				<InlineStatus tone="error" message={error} />
			{/if}
		</div>

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
				{busy ? 'Recording…' : 'Record delay'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
