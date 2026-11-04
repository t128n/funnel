<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Dropdown } from '@sveltestrap/sveltestrap';
	import { navDropdownKeyboard } from './nav-dropdown';

	/**
	 * A Sveltestrap dropdown with Bootstrap's keyboard contract. The wrapper is
	 * intentionally layout-neutral (`d-inline-flex`) so it can sit inside a Nav
	 * item or the navbar's right-hand control group without changing spacing.
	 */
	interface Props {
		class?: string;
		children: Snippet;
	}

	let { class: className = '', children }: Props = $props();
</script>

<span class="d-inline-flex {className}" use:navDropdownKeyboard>
	<Dropdown>
		{@render children()}
	</Dropdown>
</span>
