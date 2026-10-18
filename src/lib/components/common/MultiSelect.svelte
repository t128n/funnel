<script lang="ts">
	import { Badge } from '#lib/components/ui/badge';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu';
	import { cn } from '#lib/utils';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import type { Snippet } from 'svelte';

	export interface MultiSelectOption {
		value: string;
		label: string;
		color?: string | null;
	}

	interface Props {
		label: string;
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
		/** Optional leading glyph rendered inside the trigger. */
		icon?: Snippet;
	}

	let {
		label,
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
		icon
	}: Props = $props();

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

	function cssColor(color: string | null | undefined): string | undefined {
		if (!color) return undefined;
		return /^[0-9a-f]{6}$/i.test(color) ? `#${color}` : color;
	}

	function toggle(value: string) {
		onselect(
			selected.includes(value)
				? selected.filter((entry) => entry !== value)
				: [...selected, value]
		);
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
					: 'bg-background text-muted-foreground hover:bg-muted w-auto',
			variant === 'default' && selected.length > 0 && 'border-primary text-foreground',
			variant === 'pill' && selected.length > 0 && 'text-foreground'
		)}
	>
		{#if icon}
			<span class="inline-flex size-4 shrink-0 items-center justify-center" aria-hidden="true">
				{@render icon()}
			</span>
		{/if}
		<span class={cn('truncate text-left', variant === 'ghost' ? 'max-w-55' : 'max-w-45')}>
			{triggerText}
		</span>
		{#if !hideCount && selected.length > 0}
			<Badge variant="secondary" class="mono h-4 min-w-4 rounded-full px-1 text-[0.625rem]">
				{selected.length}
			</Badge>
		{/if}
		<ChevronDownIcon class="size-3.5 shrink-0 opacity-60" />
	</DropdownMenu.Trigger>

	<!--
		`preventScroll={false}` keeps the menu non-modal: bits-ui locks the body
		(and sets `pointer-events: none` on it) when `preventScroll` is true, which
		retargets the follow-up click to <html> and makes an enclosing popover treat
		it as an outside click. `strategy="fixed"` preserves the fixed positioning.
	-->
	<DropdownMenu.Content
		{align}
		sideOffset={6}
		class="max-h-80 w-auto min-w-50 overflow-y-auto"
		preventScroll={false}
		strategy="fixed"
	>
		{#if ordered.length === 0}
			<div class="text-muted-foreground p-2 text-xs">No options</div>
		{:else}
			{#each ordered as option (option.value)}
				<DropdownMenu.CheckboxItem
					class="gap-2"
					checked={selected.includes(option.value)}
					closeOnSelect={false}
					onCheckedChange={() => toggle(option.value)}
				>
					<span
						class="size-2 shrink-0 rounded-full"
						class:invisible={!option.color}
						style={cssColor(option.color) ? `background:${cssColor(option.color)}` : undefined}
					></span>
					<span class="flex-1 truncate">{option.label}</span>
				</DropdownMenu.CheckboxItem>
			{/each}
		{/if}

		{#if selected.length > 0}
			<DropdownMenu.Separator />
			<DropdownMenu.Item class="text-muted-foreground" onSelect={() => onselect([])}>
				Clear
			</DropdownMenu.Item>
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>
