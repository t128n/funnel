<script lang="ts">
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu';
	import { cn } from '#lib/utils';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
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

	const current = $derived(options.find((o) => o.value === value) ?? null);

	function cssColor(color: string | null | undefined): string | undefined {
		if (!color) return undefined;
		return /^[0-9a-f]{6}$/i.test(color) ? `#${color}` : color;
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		{disabled}
		class={cn(
			'focus-visible:border-ring focus-visible:ring-ring/50 flex h-7 shrink-0 items-center gap-1.5 border px-2 text-xs outline-none transition-colors focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50',
			variant === 'ghost'
				? 'text-muted-foreground hover:bg-accent hover:text-foreground w-auto border-transparent bg-transparent'
				: variant === 'pill'
					? 'text-muted-foreground hover:bg-accent hover:text-foreground w-auto border-border bg-muted/50'
					: 'bg-background text-muted-foreground hover:bg-muted w-full',
			variant !== 'ghost' && value !== null && 'text-foreground'
		)}
	>
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
		<span class="flex-1 truncate text-left">{current?.label ?? label}</span>
		<ChevronDownIcon class="size-3.5 shrink-0 opacity-60" />
	</DropdownMenu.Trigger>

	<!-- `preventScroll={false}`/`strategy="fixed"` keep the menu non-modal so an
	     enclosing popover is not read as an outside click; see MultiSelect. -->
	<DropdownMenu.Content
		sideOffset={6}
		align="start"
		class="w-auto min-w-45"
		preventScroll={false}
		strategy="fixed"
	>
		<DropdownMenu.RadioGroup value={value ?? ''} onValueChange={(next) => onselect(next || null)}>
			{#each options as option (option.value)}
				<DropdownMenu.RadioItem value={option.value} class="gap-2">
					<span
						class="size-2 shrink-0 rounded-full"
						class:invisible={!option.color}
						style={cssColor(option.color) ? `background:${cssColor(option.color)}` : undefined}
					></span>
					<span class="flex-1 truncate">{option.label}</span>
				</DropdownMenu.RadioItem>
			{/each}
		</DropdownMenu.RadioGroup>

		{#if allowClear && value !== null}
			<DropdownMenu.Separator />
			<DropdownMenu.Item class="text-muted-foreground" onSelect={() => onselect(null)}>
				{clearLabel}
			</DropdownMenu.Item>
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>
