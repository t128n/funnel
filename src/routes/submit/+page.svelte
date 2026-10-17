<script lang="ts">
	import type { PageProps } from './$types';
	import CarbonFunnelSequence from '~icons/carbon/funnel-sequence';

	let { form }: PageProps = $props();
</script>

<div class="page">
	<div class="card">
		<header class="card__head">
			<span class="brand__mark"><CarbonFunnelSequence width="18" height="18" aria-hidden="true" /></span>
			<h1>Submit an issue</h1>
		</header>

		{#if form?.submitted}
			<div class="success" role="status">
				Thanks — your submission was received and is awaiting triage.
			</div>
		{:else}
			<p class="hint">
				Your submission is staged locally and reviewed before it becomes a GitHub issue.
			</p>

			{#if form?.error}
				<div class="error" role="alert">{form.error}</div>
			{/if}

			<form method="POST" class="form">
				<label>
					<span>Title</span>
					<input
						name="title"
						type="text"
						required
						maxlength="256"
						placeholder="Short, descriptive title"
						value={form?.title ?? ''}
					/>
				</label>

				<label>
					<span>Details</span>
					<textarea
						name="body"
						rows="6"
						placeholder="What happened? What did you expect?"
					>{form?.body ?? ''}</textarea>
				</label>

				<label>
					<span>Source <em>(optional)</em></span>
					<input
						name="source"
						type="text"
						placeholder="Your email, team, or tool"
						value={form?.source ?? ''}
					/>
				</label>

				<button type="submit">Submit</button>
			</form>
		{/if}
	</div>
</div>

<style>
	.page {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		min-height: 100dvh;
		padding: var(--space-lg);
		background: var(--color-surface-base);
	}

	.card {
		width: 480px;
		max-width: 100%;
		padding: var(--space-xl);
		background: var(--color-surface-layer-1);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-overlay);
	}

	.card__head {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		margin-bottom: var(--space-md);
	}

	.brand__mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-md);
		background: var(--color-primary);
		color: var(--color-on-primary);
		font-weight: var(--weight-semibold);
	}

	h1 {
		margin: 0;
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
	}

	.hint {
		margin: 0 0 var(--space-md);
		color: var(--color-text-muted);
		font-size: var(--text-sm);
	}

	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	label {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}

	label em {
		color: var(--color-text-muted);
		font-style: normal;
	}

	input,
	textarea {
		padding: var(--space-sm);
		background: var(--color-surface-layer-2);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-sm);
		font-size: var(--text-base);
		color: var(--color-text-primary);
		resize: vertical;
	}

	button {
		align-self: flex-start;
		height: 34px;
		padding: 0 var(--space-lg);
		background: var(--color-primary);
		border: 1px solid var(--color-primary);
		border-radius: var(--radius-sm);
		color: var(--color-on-primary);
		font-size: var(--text-base);
		font-weight: var(--weight-medium);
		cursor: pointer;
	}

	.success,
	.error {
		padding: var(--space-md);
		border-radius: var(--radius-sm);
		font-size: var(--text-base);
	}

	.success {
		background: color-mix(in srgb, var(--color-accent-green) 14%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-accent-green) 40%, transparent);
		color: var(--color-accent-green);
	}

	.error {
		margin-bottom: var(--space-md);
		background: color-mix(in srgb, var(--color-accent-red) 14%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-accent-red) 40%, transparent);
		color: var(--color-accent-red);
	}
</style>
