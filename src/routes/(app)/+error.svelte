<script lang="ts">
	import { page } from '$app/state';
	import ErrorState from '#lib/components/common/ErrorState.svelte';
</script>

<!--
	Errors raised by an app route (a missing milestone, epic, or inbox
	submission) render inside the authenticated `(app)` layout, so the navbar,
	theme control, and skip link stay in place. The error itself is the content
	of this route's main region. A failure in the layout itself bubbles to the
	root error page instead.
-->
<main class="container-xl py-4" aria-label="Error">
	<ErrorState
		status={page.status}
		message={page.error?.message}
		requestId={page.error?.id ?? null}
	/>
</main>
