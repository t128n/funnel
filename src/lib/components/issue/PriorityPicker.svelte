<script lang="ts">
	import PriorityText from '#lib/components/common/PriorityText.svelte';
	import { selectTriggerClass } from '#lib/components/common/select-trigger';
	import * as Popover from '#lib/components/ui/popover';
	import {
		IMPACT_SCALE,
		URGENCY_SCALE,
		derivePriorityOrNull,
		priorityMeta,
		scaleLevel
	} from '#lib/priority';
	import { cn } from '#lib/utils';

	/**
	 * One Priority affordance in the Inspector. A single pill shows the derived
	 * value; the popover sets the two inputs behind it, impact and urgency, on a
	 * 0–3 slider (0 = not assessed). The derived token updates live before the
	 * write lands.
	 */
	interface Props {
		impact: number | null;
		urgency: number | null;
		/** The committed derived value; drives the closed pill. */
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
	// authoritative while the popover is open; a closed popover mirrors props.
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
		// popover does not keep showing a change that never landed.
		if (ok === false) syncFromProps();
	}

	async function clear(): Promise<void> {
		localImpact = null;
		localUrgency = null;
		const ok = await onclear();
		if (ok === false) syncFromProps();
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		{disabled}
		class={selectTriggerClass('ghost', cn('h-(--size-control-md) gap-1.5', priority && 'text-fg'))}
		title="Priority"
	>
		{#if currentMeta}
			<PriorityText priority={currentMeta.value} showName />
		{:else}
			<span class="text-fg-muted">No priority</span>
		{/if}
	</Popover.Trigger>

	<Popover.Content align="start" sideOffset={6} preventScroll={false} class="w-80 max-h-[70vh] overflow-y-auto gap-3">
		<Popover.Header>
			<Popover.Title>Priority</Popover.Title>
			<Popover.Description>
				Derived from the impact and urgency labels on the issue.
			</Popover.Description>
		</Popover.Header>

		<div class="flex items-center justify-between gap-3 border-t border-border-subtle pt-2">
			<span class="text-caption font-semibold text-fg-secondary">Result</span>
			<span class="inline-flex min-w-0 items-center gap-1.5">
				{#if previewMeta}
					<PriorityText priority={previewMeta.value} showName />
				{:else}
					<span class="text-caption text-fg-muted">No priority</span>
				{/if}
			</span>
		</div>

		<div class="flex flex-col gap-1.5">
			<div class="flex items-baseline justify-between gap-2">
				<span class="text-caption font-semibold text-fg-secondary">Impact</span>
				<span class="text-caption text-fg-muted">
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
				class="w-full accent-primary"
				oninput={(event) => onAxisInput('impact', event)}
				onchange={() => void commit('impact')}
			/>
			{#if impactLevel}
				<div class="flex flex-col gap-1">
					<p class="text-caption leading-caption text-fg-secondary">
						{impactLevel.definition}
					</p>
					<ul class="text-caption flex flex-col gap-0.5 pl-3 leading-caption text-fg-muted">
						{#each impactLevel.criteria as criterion (criterion.label)}
							<li>
								<span class="font-semibold text-fg-secondary">{criterion.label}</span>
								<span aria-hidden="true"> — </span>
								{criterion.anchor}
							</li>
						{/each}
					</ul>
				</div>
			{:else}
				<p class="min-h-8 text-caption leading-caption text-fg-muted">
					Reach, data loss, money, locations, workaround
				</p>
			{/if}
		</div>

		<div class="flex flex-col gap-1.5">
			<div class="flex items-baseline justify-between gap-2">
				<span class="text-caption font-semibold text-fg-secondary">Urgency</span>
				<span class="text-caption text-fg-muted">
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
				class="w-full accent-primary"
				oninput={(event) => onAxisInput('urgency', event)}
				onchange={() => void commit('urgency')}
			/>
			{#if urgencyLevel}
				<div class="flex flex-col gap-1">
					<p class="text-caption leading-caption text-fg-secondary">
						{urgencyLevel.definition}
					</p>
					<ul class="text-caption flex flex-col gap-0.5 pl-3 leading-caption text-fg-muted">
						{#each urgencyLevel.criteria as criterion (criterion.label)}
							<li>
								<span class="font-semibold text-fg-secondary">{criterion.label}</span>
								<span aria-hidden="true"> — </span>
								{criterion.anchor}
							</li>
						{/each}
					</ul>
				</div>
			{:else}
				<p class="min-h-8 text-caption leading-caption text-fg-muted">
					Harm now, data or money at risk, spread, blocked people, deadline
				</p>
			{/if}
		</div>

		{#if localImpact !== null || localUrgency !== null}
			<button
				type="button"
				class="self-start text-caption text-fg-muted hover:text-fg"
				{disabled}
				onclick={() => void clear()}
			>
				Clear priority
			</button>
		{/if}
	</Popover.Content>
</Popover.Root>
