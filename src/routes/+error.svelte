<script lang="ts">
	import { page } from '$app/state';
	import ErrorState from '#lib/components/common/ErrorState.svelte';
</script>

<!--
	Root error page. Rendered inside the root layout (so `global.css`, the theme
	script, and the Toaster are all present). `page.status` / `page.error` are
	filled from the server `handleError` hook; see `ErrorState` for the copy and
	safety rules.
-->
<ErrorState
	status={page.status}
	message={page.error?.message}
	requestId={page.error?.id ?? null}
/>
