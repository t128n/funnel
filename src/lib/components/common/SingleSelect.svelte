<script lang="ts">
	import type { Snippet } from 'svelte';

	export interface SingleSelectOption {
		value: string;
		label: string;
		color?: string | null;
	}

	interface Props {
		label: string;
		options: SingleSelectOption[];
		value: string | null;
		onselect: (value: string | null) => void;
		allowClear?: boolean;
		clearLabel?: string;
		disabled?: boolean;
		/** Trigger styling: `default` (form control), `ghost` (borderless), or
		 *  `pill` (contained toolbar pill). */
		variant?: 'default' | 'ghost' | 'pill';
		/** Optional leading glyph rendered inside the control. */
		icon?: Snippet;
		/** Accessible name when the visible label sits outside the trigger. */
		ariaLabel?: string;
	}

	let {
		label,
		options,
		value,
		onselect,
		allowClear = false,
		clearLabel = 'None',
		disabled = false,
		variant = 'default',
		icon,
		ariaLabel
	}: Props = $props();

	const selectClass = $derived(
		variant === 'ghost'
			? 'form-select form-select-sm border-0 bg-transparent'
			: variant === 'pill'
				? 'form-select form-select-sm rounded-pill border-0 bg-body-secondary'
				: 'form-select form-select-sm'
	);

	function onChange(event: Event) {
		const next = (event.currentTarget as HTMLSelectElement).value;
		onselect(next === '' ? null : next);
	}
</script>

{#if icon}
	<div class="input-group input-group-sm">
		<span class="input-group-text px-2" aria-hidden="true">{@render icon()}</span>
		<select
			class={selectClass}
			aria-label={ariaLabel ?? label}
			{disabled}
			value={value ?? ''}
			onchange={onChange}
		>
			<option value="" disabled>{label}</option>
			{#each options as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
			{#if allowClear && value !== null}
				<option value="">{clearLabel}</option>
			{/if}
		</select>
	</div>
{:else}
	<select
		class={selectClass}
		aria-label={ariaLabel ?? label}
		{disabled}
		value={value ?? ''}
		onchange={onChange}
	>
		<option value="" disabled>{label}</option>
		{#each options as option (option.value)}
			<option value={option.value}>{option.label}</option>
		{/each}
		{#if allowClear && value !== null}
			<option value="">{clearLabel}</option>
		{/if}
	</select>
{/if}
