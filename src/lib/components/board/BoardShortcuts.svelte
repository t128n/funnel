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
		class="inline-flex size-(--size-control-sm) items-center justify-center rounded-sm text-fg-secondary hover:bg-surface hover:text-fg"
		aria-label="Keyboard shortcuts"
	>
		<KeyboardIcon class="size-4" />
	</Popover.Trigger>
	<Popover.Content align="end" class="w-72">
		<span class="text-caption font-semibold text-fg-secondary">Keyboard shortcuts</span>
		<ul class="flex flex-col gap-1.5">
			{#each rows as row (row.label)}
				<li class="flex items-center justify-between gap-3">
					<span class="text-body">{row.label}</span>
					<KbdGroup class="gap-1">
						{#each row.keys as key (key)}
							<Kbd>{displayKey(key)}</Kbd>
						{/each}
					</KbdGroup>
				</li>
			{/each}
		</ul>
	</Popover.Content>
</Popover.Root>
