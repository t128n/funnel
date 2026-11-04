<script lang="ts">
	import { page } from '$app/state';
	import ErrorShell from '#lib/components/common/ErrorShell.svelte';
	import ErrorState from '#lib/components/common/ErrorState.svelte';
</script>

<!--
	Root error page. Rendered inside the root layout (so `global.css`, the theme
	script, and the Toaster are all present). The authenticated `(app)` shell's
	data is unavailable here, so a lightweight conventional shell keeps the
	brand, primary destinations, theme control, and skip link reachable.
	`ErrorState` owns the copy and safety rules.
-->
<ErrorShell>
	<ErrorState
		status={page.status}
		message={page.error?.message}
		requestId={page.error?.id ?? null}
	/>
</ErrorShell>
