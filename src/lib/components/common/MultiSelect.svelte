<script lang="ts">
	import { Badge } from '#lib/components/primitives/badge';
	import * as Command from '#lib/components/primitives/command';
	import * as Popover from '#lib/components/primitives/popover';
	import {
		selectTriggerChevron,
		selectTriggerClass
	} from '#lib/components/common/select-trigger';
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

	let open = $state(false);

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

	/**
	 * Keep the popover open while a click lands inside a nested menu it triggered
	 * (e.g. a second filter toolbar). Mirrors bits-ui's own floating-layer guard.
	 */
	function onInteractOutside(event: PointerEvent) {
		const target = event.target;
		if (
			target instanceof Element &&
			target.closest(
				'[data-slot="dropdown-menu-content"], [data-slot="dropdown-menu-trigger"], [data-slot="command"]'
			)
		) {
			event.preventDefault();
		}
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		{disabled}
		class={selectTriggerClass(
			variant,
			cn(
				'w-auto',
				variant === 'default' && selected.length > 0 && 'border-primary text-foreground',
				variant === 'pill' && selected.length > 0 && 'text-foreground'
			)
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
			<Badge variant="secondary" class="min-w-4 justify-center tabular-nums">
				{selected.length}
			</Badge>
		{/if}
		<ChevronDownIcon class={selectTriggerChevron} />
	</Popover.Trigger>

	<Popover.Content
		{align}
		sideOffset={6}
		preventScroll={false}
		class="w-auto min-w-50 gap-0 p-0"
		{onInteractOutside}
	>
		<Command.Root>
			<Command.Input placeholder="Search…" />
			<Command.List class="max-h-80 overflow-x-hidden overflow-y-auto">
				<Command.Empty>No options</Command.Empty>
				<Command.Group>
					{#each ordered as option (option.value)}
						<Command.Item
							value={option.value}
							data-checked={selected.includes(option.value)}
							onSelect={() => toggle(option.value)}
							class="gap-2"
						>
							<span
								class="size-2 shrink-0 rounded-full"
								class:invisible={!option.color}
								style={cssColor(option.color) ? `background:${cssColor(option.color)}` : undefined}
							></span>
							<span class="flex-1 truncate">{option.label}</span>
						</Command.Item>
					{/each}
				</Command.Group>

				{#if selected.length > 0}
					<Command.Separator />
					<Command.Item value="__clear__" onSelect={() => onselect([])}>
						<span class="text-muted-foreground">Clear</span>
					</Command.Item>
				{/if}
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
