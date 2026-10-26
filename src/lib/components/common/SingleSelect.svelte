<script lang="ts">
	import * as Select from '#lib/components/primitives/select';
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
		/** Optional leading glyph rendered inside the trigger. */
		icon?: Snippet;
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
		icon
	}: Props = $props();

	/** bits-ui needs a concrete value; a sentinel is clearer than an empty one. */
	const CLEAR = '__clear__';

	const items = $derived(options.map((option) => ({ value: option.value, label: option.label })));
	const current = $derived(options.find((o) => o.value === value) ?? null);

	function cssColor(color: string | null | undefined): string | undefined {
		if (!color) return undefined;
		return /^[0-9a-f]{6}$/i.test(color) ? `#${color}` : color;
	}

	function onChange(next: string) {
		onselect(next === CLEAR ? null : next);
	}
</script>

<Select.Root
	type="single"
	{items}
	value={value ?? ''}
	onValueChange={onChange}
	{disabled}
>
	<Select.Trigger variant={variant} class={variant === 'default' ? 'w-full' : 'w-auto'}>
		{#if icon}
			<span class="inline-flex size-4 shrink-0 items-center justify-center" aria-hidden="true">
				{@render icon()}
			</span>
		{:else}
			<span
				class="size-2 shrink-0 rounded-full"
				class:invisible={!current?.color}
				style={cssColor(current?.color) ? `background:${cssColor(current?.color)}` : undefined}
			></span>
		{/if}
		<Select.Value placeholder={label} />
	</Select.Trigger>

	<Select.Content>
		<Select.Group>
			{#each options as option (option.value)}
				<Select.Item value={option.value} label={option.label}>
					<span
						class="size-2 shrink-0 rounded-full"
						class:invisible={!option.color}
						style={cssColor(option.color) ? `background:${cssColor(option.color)}` : undefined}
					></span>
					<span class="flex-1 truncate">{option.label}</span>
				</Select.Item>
			{/each}
		</Select.Group>

		{#if allowClear && value !== null}
			<Select.Separator />
			<Select.Item value={CLEAR} label={clearLabel}>
				<span class="text-muted-foreground">{clearLabel}</span>
			</Select.Item>
		{/if}
	</Select.Content>
</Select.Root>
