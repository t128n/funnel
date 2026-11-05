<script lang="ts">
	import {
		Dropdown,
		DropdownMenu,
		DropdownToggle
	} from '@sveltestrap/sveltestrap';
	import type { Snippet } from 'svelte';

	export interface MultiSelectOption {
		value: string;
		label: string;
		color?: string | null;
	}

	interface Props {
		label: string;
		/** Id for the trigger button, so an external `<Label for>` can name it. */
		id?: string;
		/** Accessible name when the visible label sits outside the trigger. */
		ariaLabel?: string;
		options: MultiSelectOption[];
		selected: string[];
		onselect: (values: string[]) => void;
		/** Values pinned to the top of the list (e.g. `me`). */
		pinned?: string[];
		align?: 'start' | 'end';
		disabled?: boolean;
		/** Hide the count badge even when values are selected. */
		hideCount?: boolean;
		/**
		 * `label` (default) keeps the trigger text static and relies on the count
		 * badge — the filter toolbars' dimension-name style. `selection` shows the
		 * selected option labels instead, using {@link placeholder} when empty.
		 */
		display?: 'label' | 'selection';
		/** Shown in `selection` display mode when nothing is selected. */
		placeholder?: string;
		/** Trigger styling: `default` (filter toolbar), `ghost` (borderless), or
		 *  `pill` (contained toolbar pill). */
		variant?: 'default' | 'ghost' | 'pill';
		/**
		 * Trigger density: `sm` (default, the filter toolbars' compact control)
		 * or `md`, the default-size trigger used beside the Properties selects.
		 */
		size?: 'sm' | 'md';
		/** Stretch the trigger to its container, matching a full-width select. */
		fullWidth?: boolean;
		/** Optional leading glyph rendered inside the trigger. */
		icon?: Snippet;
	}

	let {
		label,
		id,
		ariaLabel,
		options,
		selected,
		onselect,
		pinned = [],
		align = 'start',
		disabled = false,
		hideCount = false,
		display = 'label',
		placeholder,
		variant = 'default',
		size = 'sm',
		fullWidth = false,
		icon
	}: Props = $props();

	let query = $state('');

	const triggerText = $derived.by(() => {
		if (display !== 'selection') return label;
		if (selected.length === 0) return placeholder ?? label;
		return selected
			.map((value) => options.find((o) => o.value === value)?.label ?? value)
			.join(', ');
	});

	const ordered = $derived.by(() => {
		const pinnedSet = new Set(pinned);
		const head = options.filter((o) => pinnedSet.has(o.value));
		const tail = options.filter((o) => !pinnedSet.has(o.value));
		return [...head, ...tail];
	});

	const filtered = $derived(
		query.trim() === ''
			? ordered
			: ordered.filter((option) =>
					option.label.toLowerCase().includes(query.trim().toLowerCase())
				)
	);

	const toggleClass = $derived(
		variant === 'ghost'
			? 'btn-link text-decoration-none text-body-secondary'
			: variant === 'pill'
				? 'rounded-pill'
				: ''
	);

	function toggle(value: string) {
		onselect(
			selected.includes(value)
				? selected.filter((entry) => entry !== value)
				: [...selected, value]
		);
	}
</script>

<Dropdown autoClose="outside">
	<DropdownToggle
		{id}
		aria-label={ariaLabel}
		color={variant === 'ghost' ? 'link' : 'secondary'}
		outline={variant !== 'ghost'}
		size={size === 'sm' ? 'sm' : undefined}
		disabled={disabled}
		class="d-flex align-items-center gap-1 {fullWidth
			? 'w-100 justify-content-between'
			: ''} {toggleClass}"
	>
		{#if icon}
			<span class="d-inline-flex align-items-center" aria-hidden="true">{@render icon()}</span>
		{/if}
		<span class="text-truncate" style="max-width: 14rem">{triggerText}</span>
		{#if !hideCount && selected.length > 0}
			<span class="badge text-bg-secondary rounded-pill" aria-label={`${selected.length} selected`}>
				{selected.length}
			</span>
		{/if}
		<i class="bi bi-chevron-down {size === 'sm' ? 'small' : ''}" aria-hidden="true"></i>
	</DropdownToggle>

	<DropdownMenu end={align === 'end'} class="p-0" style="min-width: 16rem">
		<li class="p-2">
			<input
				type="search"
				class="form-control form-control-sm mb-2"
				placeholder="Search…"
				aria-label={`Search ${label}`}
				bind:value={query}
			/>

			<div class="overflow-auto" style="max-height: 18rem">
				{#each filtered as option (option.value)}
					<label class="dropdown-item d-flex align-items-center gap-2">
						<input
							type="checkbox"
							class="form-check-input mt-0 flex-shrink-0"
							checked={selected.includes(option.value)}
							onchange={() => toggle(option.value)}
						/>
						<span class="text-truncate">{option.label}</span>
					</label>
				{/each}
				{#if filtered.length === 0}
					<span class="dropdown-item-text text-body-secondary">No options</span>
				{/if}
			</div>

			{#if selected.length > 0}
				<hr class="dropdown-divider" />
				<button
					type="button"
					class="dropdown-item text-body-secondary"
					onclick={() => onselect([])}
				>
					Clear
				</button>
			{/if}
		</li>
	</DropdownMenu>
</Dropdown>
