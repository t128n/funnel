<script lang="ts">
	import { untrack } from 'svelte';
	import { Button, FormGroup, FormText, Input, Label } from '@sveltestrap/sveltestrap';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import FocusedShell from '#lib/components/onboarding/focused-shell.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import OnboardingSteps from '#lib/components/onboarding/onboarding-steps.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let account = $state<'user' | 'organization'>('user');
	let name = $state(untrack(() => data.suggestedName));
	let org = $state('');
	let githubHost = $state(untrack(() => data.host.url));
</script>

<PageHead
	title={data.locked ? 'Token Required' : 'Create the GitHub App'}
	description="Create and install the GitHub App that powers this Funnel instance."
/>

<FocusedShell>
	<header>
		<h1 class="h4 mb-1">
			{data.locked ? 'Token Required' : 'Create the GitHub App'}
		</h1>
		<p class="measure text-body-secondary mb-0">
			{data.locked
				? 'This instance is protected. Unlock onboarding with the instance token to continue.'
				: 'Funnel creates and installs a GitHub App for you — no manual copy-pasting of credentials or permissions.'}
		</p>
	</header>

	<OnboardingSteps active={1} />

	{#if data.locked}
		<section class="min-w-0 w-100 border-top pt-4">
			<h2 class="h6 mb-1">Instance token</h2>
			<p class="mb-0 text-body-secondary">
				Enter the token from FUNNEL_ONBOARDING_TOKEN.
			</p>
			<form method="GET" action="/onboarding" class="mt-3">
				<FormGroup>
					<Label for="token">Token</Label>
					<Input
						id="token"
						name="token"
						type="password"
						autocomplete="off"
						spellcheck="false"
						required
					/>
				</FormGroup>
				{#if data.error}
					<InlineStatus tone="error" message={data.error} class="mb-3" />
				{/if}
				<div>
					<Button type="submit" color="primary">Unlock</Button>
				</div>
			</form>
		</section>
	{:else}
		<section class="min-w-0 w-100 border-top pt-4">
			<h2 class="h6 mb-1">App details</h2>
			<p class="mb-0 text-body-secondary">
				GitHub opens a pre-filled registration page. Confirm it there and Funnel stores the
				generated credentials automatically.
			</p>

			<form method="POST" action="/onboarding/manifest" class="mt-3">
				<FormGroup>
					<Label for="account">Account</Label>
					<select
						class="form-select"
						id="account"
						name="account"
						bind:value={account}
					>
						<option value="user">My personal account</option>
						<option value="organization">An organization</option>
					</select>
				</FormGroup>

				<FormGroup>
					<Label for="githubHost">GitHub host</Label>
					<Input
						id="githubHost"
						name="githubHost"
						bind:value={githubHost}
						placeholder="github.com"
						autocomplete="off"
						spellcheck="false"
						required
					/>
					<FormText>
						Use <span class="font-monospace">github.com</span>, or the host of your GitHub
						Enterprise Server instance such as <span class="font-monospace">acme.ghe.com</span>.
					</FormText>
				</FormGroup>

				{#if account === 'organization'}
					<FormGroup>
						<Label for="org">Organization</Label>
						<Input
							id="org"
							name="org"
							bind:value={org}
							placeholder="my-org"
							autocomplete="off"
							spellcheck="false"
							required
						/>
						<FormText>The GitHub organization that will own the App.</FormText>
					</FormGroup>
				{/if}

				<FormGroup>
					<Label for="name">App name</Label>
					<Input
						id="name"
						name="name"
						bind:value={name}
						autocomplete="off"
						spellcheck="false"
						maxlength={34}
						required
					/>
					<FormText>Must be unique across GitHub. Letters, numbers, and hyphens only.</FormText>
				</FormGroup>

				<dl class="property-list mb-3">
					<dt>Instance URL</dt>
					<dd><span class="font-monospace text-break">{data.publicOrigin}</span></dd>
				</dl>

				<p class="mb-0 text-body-secondary">
					Funnel polls GitHub for changes, so the server does not need an inbound
					connection from GitHub.
				</p>

				{#if data.error}
					<InlineStatus tone="error" message={data.error} class="mb-3" />
				{/if}

				<div>
					<Button type="submit" color="primary">Create GitHub App</Button>
				</div>
			</form>
		</section>
	{/if}
</FocusedShell>
