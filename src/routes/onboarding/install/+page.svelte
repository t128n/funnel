<script lang="ts">
	import FunnelIcon from '@lucide/svelte/icons/funnel';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import { Button } from '#lib/components/primitives/button';
	import * as Card from '#lib/components/primitives/card';
	import OnboardingSteps from '#lib/components/onboarding/onboarding-steps.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<PageHead title="Install the app" description="Install the GitHub App to grant Funnel access." />

<main class="bg-background flex min-h-svh flex-col items-center justify-center p-6">
	<div class="w-full max-w-lg">
		<div class="mb-6 flex flex-col items-center gap-3 text-center">
			<FunnelIcon class="size-9" />
			<h1 class="text-xl font-medium">Install the app</h1>
			<p class="text-muted-foreground max-w-sm text-sm leading-relaxed">
				<strong class="text-foreground">{data.appName}</strong> now exists on GitHub. Install it to
				grant Funnel access — choose “All repositories” or pick specific ones.
			</p>
		</div>

		<OnboardingSteps active={2} />

		<Card.Root class="mt-4">
			<Card.Header>
				<Card.Title>{data.appName}</Card.Title>
				<Card.Description>
					Owner: <code>{data.ownerLogin}</code> · slug <code>{data.appSlug}</code>
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-3">
				<Button href={data.installUrl} class="self-start">
					<ExternalLinkIcon />
					Install on GitHub
				</Button>
				<p class="text-muted-foreground text-xs leading-relaxed">
					GitHub returns you here automatically once the installation completes.
				</p>
			</Card.Content>
		</Card.Root>
	</div>
</main>
