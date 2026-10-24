<script lang="ts">
	import Spinner from '#lib/components/common/Spinner.svelte';
	import * as Alert from '#lib/components/ui/alert';
	import { Button } from '#lib/components/ui/button';
	import * as Dialog from '#lib/components/ui/dialog';
	import * as Field from '#lib/components/ui/field';
	import { Input } from '#lib/components/ui/input';
	import * as NativeSelect from '#lib/components/ui/native-select';
	import { Textarea } from '#lib/components/ui/textarea';
	import { quickRecheckDates, toISODate } from '#lib/attention';
	import { clockTick } from '#lib/client/clock.svelte';
	import type { BlockPayload } from '#lib/client/issue-actions.svelte';
	import {
		DELAY_REASONS,
		type BlockInfo,
		type DelayReason
	} from '#lib/funnel-metadata';
	import { cn } from '#lib/utils';
	import {
		canSubmitBlock,
		delayReasonLabel,
		isDelayReason
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

	function confirm() {
		if (!canConfirm) return;
		if (isBlock) {
			if (!canSubmitBlock({ blocker, needs, reason }) || !isDelayReason(reason)) return;
			onconfirm({
				kind: 'block',
				info: {
					blocker: blocker.trim(),
					needs: needs.trim(),
					trying: trying.trim(),
					recheck: recheck.trim(),
					reason
				}
			});
		} else {
			onconfirm({ kind: 'unblock', note: note.trim() });
		}
	}
</script>

<Dialog.Root
	{open}
	onOpenChange={(next) => {
		if (!busy) onopenchange(next);
	}}
>
	<Dialog.Content aria-describedby={undefined} class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title class="text-base font-semibold">
				{isBlock ? (revising ? 'Update block' : 'Block issue') : 'Unblock issue'}
			</Dialog.Title>
			<Dialog.Description class="text-muted-foreground text-xs">
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
			</Dialog.Description>
		</Dialog.Header>

		{#if isBlock}
			<div class="flex flex-col gap-4">
				<Field.Field>
					<Field.Label for="blocker">
						Blocker <span class="text-destructive font-normal">required</span>
					</Field.Label>
					<Textarea
						id="blocker"
						rows={2}
						placeholder="What is blocking this issue?"
						value={blocker}
						oninput={(e) => (blocker = e.currentTarget.value)}
					></Textarea>
				</Field.Field>

				<Field.Field>
					<Field.Label for="block-reason">
						Reason <span class="text-destructive font-normal">required</span>
					</Field.Label>
					<NativeSelect.Root id="block-reason" bind:value={reason}>
						<NativeSelect.Option value="">Select a reason</NativeSelect.Option>
						{#each DELAY_REASONS as value (value)}
							<NativeSelect.Option {value}>{delayReasonLabel(value)}</NativeSelect.Option>
						{/each}
					</NativeSelect.Root>
				</Field.Field>

				<Field.Field>
					<Field.Label for="needs">
						Needs to unblock <span class="text-destructive font-normal">required</span>
					</Field.Label>
					<Textarea
						id="needs"
						rows={2}
						placeholder="The concrete step that must happen to unblock it"
						value={needs}
						oninput={(e) => (needs = e.currentTarget.value)}
					></Textarea>
				</Field.Field>

				<Field.Field>
					<Field.Label for="trying">Currently trying</Field.Label>
					<Textarea
						id="trying"
						rows={2}
						placeholder="Optional: what is being attempted in the meantime"
						value={trying}
						oninput={(e) => (trying = e.currentTarget.value)}
					></Textarea>
				</Field.Field>

				<Field.Field>
					<Field.Label for="recheck">Re-check date</Field.Label>
					<div class="flex flex-col gap-2">
						<Input id="recheck" type="date" bind:value={recheck} class="w-40" />
						<div class="flex flex-wrap items-center gap-1">
							{#each quickDates as option (option.label)}
								<Button
									type="button"
									variant="ghost"
									size="sm"
									class={cn(recheck === option.value && 'bg-accent text-foreground')}
									title={option.value}
									onclick={() => (recheck = option.value)}
								>
									{option.label}
								</Button>
							{/each}
						</div>
					</div>
				</Field.Field>
			</div>
		{:else}
			<Field.Field>
				<Field.Label for="unblock-note">
					What unblocked it <span class="text-destructive font-normal">required</span>
				</Field.Label>
				<Textarea
					id="unblock-note"
					rows={4}
					placeholder="What changed to unblock this issue?"
					value={note}
					oninput={(e) => (note = e.currentTarget.value)}
				></Textarea>
			</Field.Field>
		{/if}

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
				{isBlock ? (revising ? 'Update block' : 'Block issue') : 'Unblock issue'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
