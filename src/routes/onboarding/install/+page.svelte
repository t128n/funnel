<script lang="ts">
	import { Button } from '@sveltestrap/sveltestrap';
	import FocusedShell from '#lib/components/onboarding/focused-shell.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import OnboardingSteps from '#lib/components/onboarding/onboarding-steps.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<PageHead title="Install the GitHub App" description="Install the GitHub App to grant Funnel access." />

<FocusedShell>
	<div class="d-flex flex-column gap-2">
		<h1 class="h4 fw-semibold mb-0">Install the GitHub App</h1>
		<p class="measure text-body-secondary mb-0">
			<strong class="fw-semibold text-body">{data.appName}</strong> now exists on GitHub. Install it
			to grant Funnel access — choose “All repositories” or pick specific ones.
		</p>
	</div>

	<OnboardingSteps active={2} />

	<section class="min-w-0 w-100 border-top pt-4">
		<h2 class="h5 fw-semibold mb-0">Application</h2>

		<dl class="property-list mt-4">
			<dt>App</dt>
			<dd class="text-truncate">{data.appName}</dd>
			<dt>Owner</dt>
			<dd class="text-truncate">{data.ownerLogin}</dd>
			<dt>Slug</dt>
			<dd><span class="font-monospace text-break">{data.appSlug}</span></dd>
		</dl>

		<div class="mt-4">
			<Button color="primary" href={data.installUrl}>
				<i class="bi bi-box-arrow-up-right me-1" aria-hidden="true"></i>
				Install on GitHub
			</Button>
		</div>
		<p class="mt-2 mb-0 text-body-secondary">
			GitHub returns you here automatically once the installation completes.
		</p>
	</section>
</FocusedShell>
