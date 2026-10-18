<script lang="ts">
	import { page } from '$app/state';
	import SegmentedControl from '#lib/components/common/SegmentedControl.svelte';

	/**
	 * Open / Closed / All state switch for the Issues view.
	 *
	 * Mirrors the server's default (SPEC §9.2): with no `state` param the view
	 * shows open issues, so "Open" is also the active segment for a bare URL.
	 * "All" serializes both states, which the parser reads as an OR.
	 */
	const states = $derived(
		page.url.searchParams.getAll('state').map((value) => value.toLowerCase())
	);

	type StateView = 'open' | 'closed' | 'all';

	const current = $derived.by((): StateView => {
		const set = new Set(states);
		if (set.has('open') && set.has('closed')) return 'all';
		if (set.has('closed')) return 'closed';
		return 'open';
	});

	/** Preserve every other param (the filter dimensions) while replacing
	 *  the `state` dimension. "Open" is kept explicit for a shareable URL. */
	function href(next: StateView): string {
		const params = new URLSearchParams();
		page.url.searchParams.forEach((value, key) => {
			if (key !== 'state') params.append(key, value);
		});
		if (next === 'open') params.append('state', 'open');
		else if (next === 'closed') params.append('state', 'closed');
		else if (next === 'all') {
			params.append('state', 'open');
			params.append('state', 'closed');
		}
		const query = params.toString();
		return query ? `${page.url.pathname}?${query}` : page.url.pathname;
	}

	const items = $derived([
		{ label: 'Open', href: href('open'), active: current === 'open' },
		{ label: 'Closed', href: href('closed'), active: current === 'closed' },
		{ label: 'All', href: href('all'), active: current === 'all' }
	]);
</script>

<SegmentedControl label="Issue state" {items} />
