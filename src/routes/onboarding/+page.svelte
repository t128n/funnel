<script lang="ts">
	import FunnelIcon from '@lucide/svelte/icons/funnel';
	import { untrack } from 'svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import { Button } from '#lib/components/ui/button';
	import * as Card from '#lib/components/ui/card';
	import * as Field from '#lib/components/ui/field';
	import { Input } from '#lib/components/ui/input';
	import * as NativeSelect from '#lib/components/ui/native-select';
	import OnboardingSteps from '#lib/components/onboarding/onboarding-steps.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let account = $state<'user' | 'organization'>('user');
	let name = $state(untrack(() => data.suggestedName));
	let org = $state('');
</script>

<PageHead
	title="Set up"
	description="Create and install the GitHub App that powers this Funnel instance."
/>

<main class="bg-background flex min-h-svh flex-col items-center justify-center p-6">
	<div class="w-full max-w-lg">
		<div class="mb-6 flex flex-col items-center gap-3 text-center">
			<FunnelIcon class="size-9" />
			<h1 class="text-xl font-medium">Set up Funnel</h1>
			<p class="text-muted-foreground max-w-sm text-sm leading-relaxed">
				Funnel creates and installs a GitHub App for you — no manual copy-pasting of
				credentials, webhook URLs, or permissions.
			</p>
		</div>

		<OnboardingSteps active={1} />

		{#if data.locked}
			<Card.Root class="mt-4">
				<Card.Header>
					<Card.Title>Onboarding token required</Card.Title>
					<Card.Description>
						This instance is protected. Enter the token from
						<code>FUNNEL_ONBOARDING_TOKEN</code> to continue.
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<form method="GET" action="/onboarding">
						<Field.FieldGroup>
							<Field.Field>
								<Field.Label for="token">Token</Field.Label>
								<Input
									id="token"
									name="token"
									type="password"
									autocomplete="off"
									spellcheck="false"
									required
								/>
							</Field.Field>
							<Button type="submit">Unlock</Button>
						</Field.FieldGroup>
					</form>
				</Card.Content>
			</Card.Root>
		{:else}
			{#if data.error}
				<p class="text-destructive mt-4 text-center text-xs">{data.error}</p>
			{/if}
			<Card.Root class="mt-4">
				<Card.Header>
					<Card.Title>Create the GitHub App</Card.Title>
					<Card.Description>
						GitHub opens a pre-filled registration page. Confirm it there and
						Funnel stores the generated credentials automatically.
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<form method="POST" action="/onboarding/manifest">
						<Field.FieldGroup>
							<Field.Field>
								<Field.Label for="account">Account</Field.Label>
								<NativeSelect.Root class="w-full" name="account" bind:value={account}>
									<NativeSelect.Option value="user">
										My personal account
									</NativeSelect.Option>
									<NativeSelect.Option value="organization">
										An organization
									</NativeSelect.Option>
								</NativeSelect.Root>
							</Field.Field>

							{#if account === 'organization'}
								<Field.Field>
									<Field.Label for="org">Organization</Field.Label>
									<Input
										id="org"
										name="org"
										bind:value={org}
										placeholder="my-org"
										autocomplete="off"
										spellcheck="false"
										required
									/>
									<Field.Description>
										The GitHub organization that will own the App.
									</Field.Description>
								</Field.Field>
							{/if}

							<Field.Field>
								<Field.Label for="name">App name</Field.Label>
								<Input
									id="name"
									name="name"
									bind:value={name}
									autocomplete="off"
									spellcheck="false"
									maxlength={34}
									required
								/>
								<Field.Description>
									Must be unique across GitHub. Letters, numbers, and hyphens only.
								</Field.Description>
							</Field.Field>

							<div class="text-muted-foreground flex flex-col gap-1 text-xs leading-relaxed">
								<span>Instance URL: <code>{data.publicOrigin}</code></span>
								<span
									>GitHub host: <code>{data.host.url}</code> &middot; API
									<code>{data.host.api_url}</code></span
								>
							</div>

							<Button type="submit" class="self-start">Create GitHub App</Button>
						</Field.FieldGroup>
					</form>
				</Card.Content>
			</Card.Root>
		{/if}
	</div>
</main>
