<script lang="ts">
	import { formatForDisplay } from '@tanstack/svelte-hotkeys';
	import { Dropdown, DropdownMenu, DropdownToggle } from '@sveltestrap/sveltestrap';
	import { appHotkeys } from '#lib/client/hotkeys';

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

<Dropdown>
	<DropdownToggle
		color="link"
		size="sm"
		caret={false}
		class="text-body-secondary text-decoration-none px-1"
		aria-label="Keyboard shortcuts"
		title="Keyboard shortcuts"
	>
		<i class="bi bi-keyboard" aria-hidden="true"></i>
	</DropdownToggle>
	<DropdownMenu end class="board-shortcuts-menu p-2">
		<li class="px-2 pb-1 small fw-semibold text-body-secondary">Keyboard shortcuts</li>
		{#each rows as row (row.label)}
			<li class="d-flex align-items-center justify-content-between gap-3 px-2 py-1">
				<span class="small text-body">{row.label}</span>
				<span class="d-inline-flex align-items-center gap-1">
					{#each row.keys as key (key)}
						<kbd class="border px-1">{displayKey(key)}</kbd>
					{/each}
				</span>
			</li>
		{/each}
	</DropdownMenu>
</Dropdown>

<style>
	:global(.board-shortcuts-menu) {
		min-width: 18rem;
	}
</style>
