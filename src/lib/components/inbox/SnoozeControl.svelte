<script lang="ts">
	import {
		Button,
		Dropdown,
		DropdownMenu,
		DropdownToggle
	} from '@sveltestrap/sveltestrap';
	import { snooze, type SnoozeTarget } from '#lib/client/mutations';
	import {
		snoozeCustomDate,
		snoozeMinDate,
		snoozeNextWeek,
		snoozeTomorrow
	} from '#lib/client/snooze';
	import { absoluteTime } from '#lib/time';

	/**
	 * Snooze picker shared by Inbox submission and issue rows. The quick
	 * choices resolve to 09:00 local time; the custom field takes a date and
	 * the server validates it again. The caller owns the optimistic removal and
	 * restores the row through `onfailure`.
	 */
	interface Props {
		target: SnoozeTarget;
		/** Accessible target description, e.g. `orgA/core#12`. */
		label: string;
		disabled?: boolean;
		/** Runs before the request, for an optimistic row removal. */
		onstart?: (until: number) => void;
		/** Runs after the server confirms the snooze. */
		onsuccess?: (until: number) => void;
		/** Runs with a human-readable reason when the request fails. */
		onfailure?: (message: string) => void;
	}

	let {
		target,
		label,
		disabled = false,
		onstart,
		onsuccess,
		onfailure
	}: Props = $props();

	let customDate = $state('');
	let customError = $state<string | null>(null);
	let busy = $state(false);

	const tomorrow = $derived(snoozeTomorrow());
	const nextWeek = $derived(snoozeNextWeek());
	const minDate = $derived(snoozeMinDate());
	/** Stable, valid HTML id for the custom date field. */
	const dateInputId = $derived(
		target.kind === 'submission'
			? `snooze-date-submission-${target.id.replace(/[^A-Za-z0-9_-]/g, '-')}`
			: `snooze-date-issue-${target.repo.replace(/[^A-Za-z0-9_-]/g, '-')}-${target.number}`
	);

	async function apply(until: number): Promise<void> {
		if (busy || disabled) return;
		customError = null;
		busy = true;
		onstart?.(until);
		const result = await snooze(target, until);
		busy = false;
		if (result.ok) {
			onsuccess?.(until);
			return;
		}
		onfailure?.(result.error);
	}

	function chooseCustom(): void {
		const until = snoozeCustomDate(customDate);
		if (until === null) {
			customError = 'Choose a valid date.';
			return;
		}
		void apply(until);
	}
</script>

<Dropdown>
	<DropdownToggle
		color="outline-secondary"
		size="sm"
		disabled={disabled || busy}
		aria-label={`Snooze ${label}`}
	>
		<i class="bi bi-alarm me-1" aria-hidden="true"></i>
		Snooze
	</DropdownToggle>

	<DropdownMenu end class="p-2" style="min-width: 17rem">
		<button
			type="button"
			class="dropdown-item d-flex align-items-center justify-content-between gap-3"
			onclick={() => void apply(tomorrow)}
		>
			<span>Tomorrow</span>
			<span class="small text-body-tertiary">{absoluteTime(tomorrow)}</span>
		</button>
		<button
			type="button"
			class="dropdown-item d-flex align-items-center justify-content-between gap-3"
			onclick={() => void apply(nextWeek)}
		>
			<span>Next week</span>
			<span class="small text-body-tertiary">{absoluteTime(nextWeek)}</span>
		</button>
		<div class="dropdown-divider"></div>
		<label class="form-label small mb-1" for={dateInputId}>Custom date</label>
		<div class="d-flex align-items-center gap-2">
			<input
				id={dateInputId}
				type="date"
				class="form-control form-control-sm"
				min={minDate}
				bind:value={customDate}
			/>
			<Button
				color="primary"
				size="sm"
				disabled={busy || customDate.length === 0}
				onclick={chooseCustom}
			>
				Set
			</Button>
		</div>
		{#if customError}
			<div class="small text-danger mt-1">{customError}</div>
		{/if}
	</DropdownMenu>
</Dropdown>
