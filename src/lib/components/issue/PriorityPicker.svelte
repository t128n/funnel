<script lang="ts">
	import PriorityIcon from '#lib/components/common/PriorityIcon.svelte';
	import { selectTriggerClass } from '#lib/components/common/select-trigger';
	import * as Popover from '#lib/components/ui/popover';
	import {
		IMPACT_SCALE,
		URGENCY_SCALE,
		derivePriorityOrNull,
		priorityMeta,
		type ScaleLevel
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

	function level<T extends number>(
		scale: readonly ScaleLevel<T>[],
		value: number | null
	): ScaleLevel<T> | null {
		return value === null ? null : (scale.find((entry) => entry.value === value) ?? null);
	}

	const impactLevel = $derived(level(IMPACT_SCALE, localImpact));
	const urgencyLevel = $derived(level(URGENCY_SCALE, localUrgency));

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
		class={selectTriggerClass('pill', cn('gap-1.5', priority && 'text-foreground'))}
		title="Priority"
	>
		<PriorityIcon priority={priority} />
		<span class="max-w-40 truncate">
			{#if currentMeta}
				{currentMeta.value} · {currentMeta.name}
			{:else}
				No priority
			{/if}
		</span>
	</Popover.Trigger>

	<Popover.Content align="start" sideOffset={6} preventScroll={false} class="w-72 gap-3">
		<Popover.Header>
			<Popover.Title>Priority</Popover.Title>
			<Popover.Description>
				Derived from the impact and urgency labels on the issue.
			</Popover.Description>
		</Popover.Header>

		<div
			class="border-border bg-muted/40 flex items-center justify-between rounded-md border px-2.5 py-1.5"
		>
			<span class="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
				Result
			</span>
			<span class="inline-flex min-w-0 items-center gap-1.5">
				<PriorityIcon priority={preview} />
				{#if previewMeta}
					<span class="text-foreground text-xs font-medium">
						{previewMeta.value} · {previewMeta.name}
					</span>
				{:else}
					<span class="text-muted-foreground text-xs">No priority</span>
				{/if}
			</span>
		</div>

		<div class="flex flex-col gap-1.5">
			<div class="flex items-baseline justify-between gap-2">
				<span class="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
					Impact
				</span>
				<span class="text-muted-foreground text-xs">
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
				style="accent-color: var(--primary)"
				class="w-full"
				oninput={(event) => onAxisInput('impact', event)}
				onchange={() => void commit('impact')}
			/>
			<p class="text-muted-foreground min-h-8 text-xs leading-snug">
				{impactLevel?.definition ?? 'Drag to rate how much this hurts.'}
			</p>
		</div>

		<div class="flex flex-col gap-1.5">
			<div class="flex items-baseline justify-between gap-2">
				<span class="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
					Urgency
				</span>
				<span class="text-muted-foreground text-xs">
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
				style="accent-color: var(--primary)"
				class="w-full"
				oninput={(event) => onAxisInput('urgency', event)}
				onchange={() => void commit('urgency')}
			/>
			<p class="text-muted-foreground min-h-8 text-xs leading-snug">
				{urgencyLevel?.definition ?? 'Drag to rate how soon it must be fixed.'}
			</p>
		</div>

		{#if localImpact !== null || localUrgency !== null}
			<button
				type="button"
				class="text-muted-foreground hover:text-foreground self-start text-xs transition-colors"
				{disabled}
				onclick={() => void clear()}
			>
				Clear priority
			</button>
		{/if}
	</Popover.Content>
</Popover.Root>
