<script lang="ts">
	import { signInWithGitHub } from '#lib/client/auth';
	import CarbonFunnelSequence from '~icons/carbon/funnel-sequence';
	import CarbonLogoGithub from '~icons/carbon/logo-github';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let pending = $state(false);

	async function signIn() {
		pending = true;
		await signInWithGitHub(data.redirectTo);
	}
</script>

<div class="page">
	<div class="card">
		<div class="brand">
			<span class="brand__mark"><CarbonFunnelSequence width="20" height="20" aria-hidden="true" /></span>
			<span class="brand__name">Funnel</span>
		</div>
		<p class="tagline">High-density GitHub triage.</p>

		<button class="github" type="button" onclick={signIn} disabled={pending}>
			<CarbonLogoGithub width="16" height="16" aria-hidden="true" />
			{pending ? 'Redirecting…' : 'Sign in with GitHub'}
		</button>

		<p class="footnote">Access is limited to your GitHub organization.</p>
	</div>
</div>

<style>
	.page {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		min-height: 100dvh;
		background: var(--color-surface-base);
		padding: var(--space-lg);
	}

	.card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-md);
		width: 320px;
		padding: var(--space-xxl);
		background: var(--color-surface-layer-1);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-overlay);
		text-align: center;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}

	.brand__mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-md);
		background: var(--color-primary);
		color: var(--color-on-primary);
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
	}

	.brand__name {
		font-size: var(--text-xl);
		font-weight: var(--weight-semibold);
		letter-spacing: -0.015em;
	}

	.tagline {
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--text-sm);
	}

	.github {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		width: 100%;
		height: 38px;
		background: var(--color-surface-layer-2);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		color: var(--color-text-primary);
		font-size: var(--text-base);
		font-weight: var(--weight-medium);
		cursor: pointer;
	}

	.github:hover {
		border-color: var(--color-primary);
	}

	.github:disabled {
		opacity: 0.6;
		cursor: progress;
	}

	.footnote {
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--text-xs);
	}
</style>
