<script lang="ts">
	import {
		Button,
		Dropdown,
		DropdownMenu,
		DropdownToggle
	} from '@sveltestrap/sveltestrap';
	import PriorityText from '#lib/components/common/PriorityText.svelte';
	import {
		IMPACT_SCALE,
		URGENCY_SCALE,
		derivePriorityOrNull,
		priorityMeta,
		scaleLevel
	} from '#lib/priority';

	/**
	 * One Priority affordance in the Inspector. A single control shows the
	 * derived value; the dropdown sets the two inputs behind it, impact and
	 * urgency, on a 0–3 slider (0 = not assessed). The derived token updates
	 * live before the write lands.
	 */
	interface Props {
		impact: number | null;
		urgency: number | null;
		/** The committed derived value; drives the closed control. */
		priority: string | null;
		disabled?: boolean;
		/** Persists one axis; `null` clears it. Returns whether the write landed. */
		oncommit: (
			axis: 'impact' | 'urgency',
			value: number | null
		) => Promise<boolean> | boolean;
		/** Clears both axes back to the no-priority state. */
		onclear: () => Promise<boolean> | boolean;
	}

	let {
		impact,
		urgency,
		priority,
		disabled = false,
		oncommit,
		onclear
	}: Props = $props();

	let open = $state(false);
	let localImpact = $state<number | null>(null);
	let localUrgency = $state<number | null>(null);

	function syncFromProps(): void {
		localImpact = impact;
		localUrgency = urgency;
	}

	// The slider is the only place the axes are edited, so the local draft is
	// authoritative while the dropdown is open; a closed dropdown mirrors props.
	$effect(() => {
		if (!open) syncFromProps();
	});

	const preview = $derived(derivePriorityOrNull(localImpact, localUrgency));
	const previewMeta = $derived(priorityMeta(preview));
	const currentMeta = $derived(priorityMeta(priority));

	const impactLevel = $derived(scaleLevel(IMPACT_SCALE, localImpact));
	const urgencyLevel = $derived(scaleLevel(URGENCY_SCALE, localUrgency));

	function onAxisInput(
		axis: 'impact' | 'urgency',
		event: Event
	): void {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		const next = value === 0 ? null : value;
		if (axis === 'impact') localImpact = next;
		else localUrgency = next;
	}

	async function commit(axis: 'impact' | 'urgency'): Promise<void> {
		const value = axis === 'impact' ? localImpact : localUrgency;
		if (value === (axis === 'impact' ? impact : urgency)) return;
		const ok = await oncommit(axis, value);
		// A failed write rolls the authoritative value back; match it so the
		// dropdown does not keep showing a change that never landed.
		if (ok === false) syncFromProps();
	}

	async function clear(): Promise<void> {
		localImpact = null;
		localUrgency = null;
		const ok = await onclear();
		if (ok === false) syncFromProps();
	}
</script>

<Dropdown
	isOpen={open}
	toggle={() => (open = !open)}
	autoClose="outside"
>
	<DropdownToggle
		color="outline-secondary"
		size="sm"
		caret
		{disabled}
		class="d-inline-flex align-items-center gap-1 text-nowrap {disabled ? 'disabled' : ''}"
		title="Priority"
		aria-label="Priority"
		aria-disabled={disabled}
	>
		{#if currentMeta}
			<PriorityText priority={currentMeta.value} showName />
		{:else}
			<span class="text-body-tertiary">No priority</span>
		{/if}
	</DropdownToggle>

	<DropdownMenu class="p-0" style="min-width: 20rem; max-height: 70vh; overflow-y: auto">
		<li class="p-3 d-flex flex-column gap-3">
			<div class="d-flex flex-column gap-1">
				<span class="fw-semibold">Priority</span>
				<span class="small text-body-secondary">
					Derived from the impact and urgency labels on the issue.
				</span>
			</div>

			<div class="d-flex align-items-center justify-content-between gap-3 border-top pt-2">
				<span class="small text-body-secondary">Result</span>
				<span class="d-inline-flex min-w-0 align-items-center gap-1">
					{#if previewMeta}
						<PriorityText priority={previewMeta.value} showName />
					{:else}
						<span class="small text-body-tertiary">No priority</span>
					{/if}
				</span>
			</div>

			<div class="d-flex flex-column gap-1">
				<div class="d-flex align-items-baseline justify-content-between gap-2">
					<span class="small text-body-secondary">Impact</span>
					<span class="small text-body-tertiary">
						{impactLevel ? `${impactLevel.value} · ${impactLevel.name}` : 'Not assessed'}
					</span>
				</div>
				<input
					type="range"
					min="0"
					max="3"
					step="1"
					value={localImpact ?? 0}
					{disabled}
					aria-label="Impact"
					class="form-range"
					oninput={(event) => onAxisInput('impact', event)}
					onchange={() => void commit('impact')}
				/>
				{#if impactLevel}
					<div class="d-flex flex-column gap-1">
						<p class="small text-body-secondary mb-0">
							{impactLevel.definition}
						</p>
						<ul class="list-unstyled small text-body-tertiary mb-0 d-flex flex-column gap-1">
							{#each impactLevel.criteria as criterion (criterion.label)}
								<li>
									<span class="text-body-secondary">{criterion.label}</span>
									<span aria-hidden="true"> — </span>
									{criterion.anchor}
								</li>
							{/each}
						</ul>
					</div>
				{:else}
					<p class="small text-body-tertiary mb-0" style="min-height: 2rem">
						Reach, data loss, money, locations, workaround
					</p>
				{/if}
			</div>

			<div class="d-flex flex-column gap-1">
				<div class="d-flex align-items-baseline justify-content-between gap-2">
					<span class="small text-body-secondary">Urgency</span>
					<span class="small text-body-tertiary">
						{urgencyLevel ? `${urgencyLevel.value} · ${urgencyLevel.name}` : 'Not assessed'}
					</span>
				</div>
				<input
					type="range"
					min="0"
					max="3"
					step="1"
					value={localUrgency ?? 0}
					{disabled}
					aria-label="Urgency"
					class="form-range"
					oninput={(event) => onAxisInput('urgency', event)}
					onchange={() => void commit('urgency')}
				/>
				{#if urgencyLevel}
					<div class="d-flex flex-column gap-1">
						<p class="small text-body-secondary mb-0">
							{urgencyLevel.definition}
						</p>
						<ul class="list-unstyled small text-body-tertiary mb-0 d-flex flex-column gap-1">
							{#each urgencyLevel.criteria as criterion (criterion.label)}
								<li>
									<span class="text-body-secondary">{criterion.label}</span>
									<span aria-hidden="true"> — </span>
									{criterion.anchor}
								</li>
							{/each}
						</ul>
					</div>
				{:else}
					<p class="small text-body-tertiary mb-0" style="min-height: 2rem">
						Harm now, data or money at risk, spread, blocked people, deadline
					</p>
				{/if}
			</div>

			{#if localImpact !== null || localUrgency !== null}
				<Button
					color="link"
					size="sm"
					class="align-self-start text-decoration-none p-0 text-body-tertiary"
					{disabled}
					onclick={() => void clear()}
				>
					Clear priority
				</Button>
			{/if}
		</li>
	</DropdownMenu>
</Dropdown>
