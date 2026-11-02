<script lang="ts">
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import FocusedShell from '#lib/components/onboarding/focused-shell.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import { Button } from '#lib/components/ui/button';
	import OnboardingSteps from '#lib/components/onboarding/onboarding-steps.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<PageHead title="Install the GitHub App" description="Install the GitHub App to grant Funnel access." />

<FocusedShell>
	<div class="flex flex-col gap-2">
		<h1 class="text-heading-md font-semibold leading-heading-md text-fg">
			Install the GitHub App
		</h1>
		<p class="max-w-[var(--layout-measure)] text-body leading-body text-fg-secondary">
			<strong class="font-semibold text-fg">{data.appName}</strong> now exists on GitHub. Install it
			to grant Funnel access — choose “All repositories” or pick specific ones.
		</p>
	</div>

	<OnboardingSteps active={2} />

	<section class="min-w-0 w-full border-t border-border-subtle pt-4">
		<h2 class="text-heading-sm font-semibold leading-heading-sm text-fg">Application</h2>

		<dl class="label-value mt-4">
			<dt>App</dt>
			<dd class="truncate">{data.appName}</dd>
			<dt>Owner</dt>
			<dd class="truncate">{data.ownerLogin}</dd>
			<dt>Slug</dt>
			<dd><span class="mono break-all">{data.appSlug}</span></dd>
		</dl>

		<div class="mt-4">
			<Button href={data.installUrl}>
				<ExternalLinkIcon />
				Install on GitHub
			</Button>
		</div>
		<p class="mt-2 text-body leading-body text-fg-secondary">
			GitHub returns you here automatically once the installation completes.
		</p>
	</section>
</FocusedShell>
