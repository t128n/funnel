<script lang="ts">
	import { formatForDisplay } from '@tanstack/svelte-hotkeys';
	import * as Popover from '#lib/components/ui/popover';
	import { Kbd, KbdGroup } from '#lib/components/ui/kbd';
	import { appHotkeys } from '#lib/client/hotkeys';
	import KeyboardIcon from '@lucide/svelte/icons/keyboard';

	/**
	 * Compact legend for the board's keyboard workflow. Reads the same hotkey
	 * catalog the registrations use, so labels cannot drift from behaviour.
	 */
	/** The catalog binding as a display string (catalog entries are strings). */
	function binding(key: keyof typeof appHotkeys): string {
		const value = appHotkeys[key].hotkey;
		return typeof value === 'string' ? value : '';
	}

	const rows = [
		{ label: 'New issue', keys: [binding('issue.create')] },
		{ label: 'Search', keys: [binding('nav.search'), binding('nav.search-slash')] },
		{ label: 'Open card', keys: [binding('issue.select')] },
		{ label: 'Change status', keys: [binding('issue.status')] },
		{ label: 'Navigate cards', keys: ['↑', '↓', '←', '→'] },
		{ label: 'Move card', keys: ['Space'] }
	];

	/** Single glyphs render as-is; catalog bindings get platform formatting. */
	function displayKey(key: string): string {
		return key.length <= 2 ? key : formatForDisplay(key);
	}
</script>

<Popover.Root>
	<Popover.Trigger
		class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 inline-flex size-7 items-center justify-center rounded outline-none focus-visible:ring-1"
		aria-label="Keyboard shortcuts"
	>
		<KeyboardIcon class="size-3.5" />
	</Popover.Trigger>
	<Popover.Content align="end" class="w-64 gap-2 p-2">
		<span class="text-muted-foreground text-xs font-medium tracking-wider uppercase">
			Keyboard
		</span>
		<ul class="flex flex-col gap-1.5">
			{#each rows as row (row.label)}
				<li class="flex items-center justify-between gap-3">
					<span class="text-xs">{row.label}</span>
					<KbdGroup class="gap-1">
						{#each row.keys as key (key)}
							<Kbd class="h-4 min-w-4 px-1 text-[10px]">{displayKey(key)}</Kbd>
						{/each}
					</KbdGroup>
				</li>
			{/each}
		</ul>
	</Popover.Content>
</Popover.Root>
