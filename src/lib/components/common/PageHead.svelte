<script lang="ts">
	import { page } from '$app/state';
	import { APP_NAME, DEFAULT_DESCRIPTION, pageTitle } from '#lib/seo';

	/**
	 * Per-route document metadata. Renders into `<svelte:head>` so the title and
	 * description are correct during SSR and after client-side navigation.
	 *
	 * The `noindex, nofollow` posture for this private instance is set once in
	 * `app.html` (and `error.html`), so pages only declare their title and
	 * description here.
	 */
	interface Props {
		/** Route-specific title; `" · Funnel"` is appended automatically. */
		title?: string;
		description?: string;
	}

	let { title = '', description = DEFAULT_DESCRIPTION }: Props = $props();

	const resolvedTitle = $derived(pageTitle(title));
	const canonical = $derived(`${page.url.origin}${page.url.pathname}`);
</script>

<svelte:head>
	<title>{resolvedTitle}</title>
	<meta name="description" content={description} />
	<meta property="og:site_name" content={APP_NAME} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={resolvedTitle} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={canonical} />
	<meta name="twitter:card" content="summary" />
</svelte:head>
