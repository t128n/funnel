<script lang="ts">
	import type { PageProps } from './$types';
	import CarbonFunnelSequence from '~icons/carbon/funnel-sequence';
	import CarbonInformation from '~icons/carbon/information';
	import CarbonCheckmark from '~icons/carbon/checkmark';

	let { form }: PageProps = $props();
</script>

<div class="page">
	<div class="pane">
		<div class="pane__top">
			<span class="brand__mark"
				><CarbonFunnelSequence width="14" height="14" aria-hidden="true" /></span
			>
			<span class="brand__name">Funnel</span>
		</div>

		{#if form?.submitted}
			<div class="done" role="status">
				<span class="done__badge">
					<CarbonCheckmark width="12" height="12" aria-hidden="true" />
					Received
				</span>
				<h1 class="done__title">Thanks — your submission is in.</h1>
				<p class="done__text">
					A triager will review it shortly. Nothing is created on GitHub until it's accepted, so
					there's nothing else you need to do.
				</p>
				<a class="btn btn--primary" href="/submit">Submit another</a>
			</div>
		{:else}
			<h1 class="sr-only">Submit an issue</h1>

			<form class="doc" method="POST" autocomplete="off">
				<div class="doc__fields">
					{#if form?.error}
						<div class="error" role="alert">{form.error}</div>
					{/if}

					<input
						class="doc__title"
						name="title"
						type="text"
						required
						maxlength="256"
						placeholder="Issue title"
						value={form?.title ?? ''}
						aria-label="Issue title"
					/>

					<p class="doc__note">
						<CarbonInformation width="13" height="13" aria-hidden="true" />
						Submissions are staged for triage before syncing to GitHub.
					</p>

					<textarea
						class="doc__body"
						name="body"
						placeholder="Add description..."
						aria-label="Description">{form?.body ?? ''}</textarea>
				</div>

				<input
					class="doc__source"
					name="source"
					type="text"
					placeholder="Add source..."
					value={form?.source ?? ''}
					aria-label="Source"
				/>

				<footer class="doc__foot">
					<button class="btn btn--primary" type="submit">Submit</button>
				</footer>
			</form>
		{/if}
	</div>
</div>

<style>
	.page {
		display: flex;
		align-items: center;
		align-items: safe center;
		justify-content: center;
		min-height: 100vh;
		min-height: 100dvh;
		padding: var(--space-xl) var(--space-lg);
		/* Subtle atmosphere: a faint primary-tinted glow lets the pane read as
		   floating on the canvas "sea" without a border or shadow (docs/DESIGN.md §Islands). */
		background:
			radial-gradient(
				55% 45% at 50% 50%,
				color-mix(in srgb, var(--color-primary) 8%, transparent),
				transparent 70%
			),
			var(--color-surface-base);
	}

	.pane {
		/* Single focused document canvas: one surface, no internal boxes, no
		   border or shadow — it separates from the canvas by surface step + glow. */
		--placeholder: color-mix(in srgb, var(--color-text-secondary) 55%, transparent);
		--muted-line: color-mix(in srgb, var(--color-text-secondary) 70%, transparent);

		display: flex;
		flex-direction: column;
		width: 100%;
		max-width: 640px;
		background: var(--color-surface-layer-1);
		border-radius: var(--island-radius);
	}

	.pane__top {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-lg) var(--space-xl) 0;
	}

	.brand__mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: var(--radius-sm);
		background: var(--color-primary);
		color: var(--color-on-primary);
	}

	.brand__name {
		font-size: var(--text-md);
		font-weight: var(--weight-semibold);
		letter-spacing: -0.01em;
		color: var(--color-text-primary);
	}

	.doc {
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
		padding: var(--space-md) var(--space-xl) var(--space-lg);
	}

	.doc__fields {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.doc__title {
		display: block;
		width: auto;
		margin: 0 calc(var(--space-sm) * -1);
		padding: var(--space-xs) var(--space-sm);
		background: transparent;
		border: 0;
		font-size: var(--text-xl);
		font-weight: var(--weight-medium);
		letter-spacing: -0.015em;
		color: var(--color-text-primary);
	}

	.doc__title::placeholder {
		color: var(--placeholder);
	}

	.doc__title:focus-visible,
	.doc__body:focus-visible,
	.doc__source:focus-visible {
		outline: none;
		border-radius: var(--radius-xs);
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-border-focus) 55%, transparent);
	}

	.doc__note {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.4;
		color: var(--muted-line);
	}

	.doc__note :global(svg) {
		flex: none;
	}

	.doc__body {
		display: block;
		width: auto;
		margin: 0 calc(var(--space-sm) * -1);
		min-height: 240px;
		padding: var(--space-xs) var(--space-sm);
		background: transparent;
		border: 0;
		font-size: var(--text-md);
		line-height: 1.6;
		color: var(--color-text-secondary);
		resize: none;
	}

	.doc__body::placeholder {
		color: var(--placeholder);
	}

	.doc__source {
		display: block;
		width: auto;
		margin: 0 calc(var(--space-sm) * -1);
		padding: var(--space-xs) var(--space-sm);
		background: transparent;
		border: 0;
		font-size: var(--text-base);
		color: var(--color-text-secondary);
	}

	.doc__source::placeholder {
		color: var(--placeholder);
	}

	.doc__foot {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		padding-top: var(--space-md);
		border-top: 1px solid color-mix(in srgb, var(--color-text-secondary) 8%, transparent);
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		height: 30px;
		padding: 0 var(--space-md);
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		font-size: var(--text-base);
		font-weight: var(--weight-medium);
		text-decoration: none;
		cursor: pointer;
		transition:
			background var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast),
			opacity var(--transition-fast);
	}

	.btn:hover {
		text-decoration: none;
	}

	.btn--primary {
		padding: 0 var(--space-lg);
		background: var(--color-text-primary);
		color: var(--color-on-primary);
	}

	.btn--primary:hover {
		opacity: 0.9;
	}

	.done {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-sm);
		padding: var(--space-lg) var(--space-xl) var(--space-xl);
	}

	.done__badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		height: 22px;
		padding: 0 var(--space-sm);
		border-radius: var(--radius-xs);
		background: color-mix(in srgb, var(--color-accent-green) 16%, transparent);
		color: var(--color-accent-green);
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.done__title {
		margin: 0;
		font-size: var(--text-xl);
		font-weight: var(--weight-semibold);
		letter-spacing: -0.015em;
		color: var(--color-text-primary);
	}

	.done__text {
		max-width: 60ch;
		margin: 0;
		font-size: var(--text-md);
		line-height: 1.6;
		color: var(--color-text-secondary);
	}

	.done .btn {
		margin-top: var(--space-sm);
	}

	.error {
		padding: var(--space-sm) var(--space-md);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		background: color-mix(in srgb, var(--color-accent-red) 14%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-accent-red) 40%, transparent);
		color: var(--color-accent-red);
	}
</style>
