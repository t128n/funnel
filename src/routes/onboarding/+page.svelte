<script lang="ts">
	import { untrack } from 'svelte';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import FocusedShell from '#lib/components/onboarding/focused-shell.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import { Button } from '#lib/components/ui/button';
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
	title={data.locked ? 'Token Required' : 'Create the GitHub App'}
	description="Create and install the GitHub App that powers this Funnel instance."
/>

<FocusedShell>
	<div class="flex flex-col gap-2">
		<h1 class="text-heading-md font-semibold leading-heading-md text-fg">
			{data.locked ? 'Token Required' : 'Create the GitHub App'}
		</h1>
		<p class="max-w-[var(--layout-measure)] text-body leading-body text-fg-secondary">
			{data.locked
				? 'This instance is protected. Unlock onboarding with the instance token to continue.'
				: 'Funnel creates and installs a GitHub App for you — no manual copy-pasting of credentials, webhook URLs, or permissions.'}
		</p>
	</div>

	<OnboardingSteps active={1} />

	{#if data.locked}
		<section class="min-w-0 w-full border-t border-border-subtle pt-4">
			<h2 class="text-heading-sm font-semibold leading-heading-sm text-fg">Instance token</h2>
			<p class="mt-1 text-body leading-body text-fg-secondary">
				Enter the token from FUNNEL_ONBOARDING_TOKEN.
			</p>
			<form method="GET" action="/onboarding" class="mt-4 flex flex-col gap-4">
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
				{#if data.error}
					<InlineStatus tone="error" message={data.error} />
				{/if}
				<div>
					<Button type="submit">Unlock</Button>
				</div>
			</form>
		</section>
	{:else}
		<section class="min-w-0 w-full border-t border-border-subtle pt-4">
			<h2 class="text-heading-sm font-semibold leading-heading-sm text-fg">App details</h2>
			<p class="mt-1 text-body leading-body text-fg-secondary">
				GitHub opens a pre-filled registration page. Confirm it there and Funnel stores the
				generated credentials automatically.
			</p>

			<form method="POST" action="/onboarding/manifest" class="mt-4 flex flex-col gap-4">
				<Field.Field>
					<Field.Label for="account">Account</Field.Label>
					<NativeSelect.Root class="w-full" id="account" name="account" bind:value={account}>
						<NativeSelect.Option value="user">My personal account</NativeSelect.Option>
						<NativeSelect.Option value="organization">An organization</NativeSelect.Option>
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
						<Field.Description>The GitHub organization that will own the App.</Field.Description>
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

				<dl class="label-value">
					<dt>Instance URL</dt>
					<dd><span class="mono break-all">{data.publicOrigin}</span></dd>
					<dt>GitHub host</dt>
					<dd><span class="mono break-all">{data.host.url}</span></dd>
					<dt>API</dt>
					<dd><span class="mono break-all">{data.host.api_url}</span></dd>
				</dl>

				{#if data.error}
					<InlineStatus tone="error" message={data.error} />
				{/if}

				<div>
					<Button type="submit">Create GitHub App</Button>
				</div>
			</form>
		</section>
	{/if}
</FocusedShell>
