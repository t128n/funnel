<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import { PRIORITY_OPTIONS, SIZE_OPTIONS } from '#lib/labels';
	import { relativeTime } from '#lib/time';
	import type { StagedSubmission } from '#lib/server/intake/staging';

	interface Props {
		submission: StagedSubmission;
		repos: string[];
		defaultRepo: string;
	}

	let { submission, repos, defaultRepo }: Props = $props();

	let acceptPending = $state(false);
	let dismissPending = $state(false);
	let duplicatePending = $state(false);

	let acceptRepo = $state(untrack(() => defaultRepo || repos[0] || ''));
	let priority = $state('');
	let size = $state('');
	let duplicating = $state(false);
	let duplicateRepo = $state(untrack(() => defaultRepo || repos[0] || ''));
	let duplicateNumber = $state('');
</script>

<article class="submission">
	<header class="submission__head">
		<span class="badge">intake</span>
		{#if submission.source}
			<span class="badge badge--muted mono">{submission.source}</span>
		{/if}
		<span class="time" title={new Date(submission.createdAt).toLocaleString()}>
			{relativeTime(submission.createdAt)}
		</span>
	</header>

	<h3 class="submission__title">{submission.title}</h3>
	{#if submission.body.trim()}
		<div class="submission__body plain-text">{submission.body}</div>
	{/if}

	<form
		class="actions"
		method="POST"
		action="?/accept"
		use:enhance={() => {
			acceptPending = true;
			return async ({ update }) => {
				await update({ reset: false });
				acceptPending = false;
			};
		}}
	>
		<input type="hidden" name="id" value={submission.id} />

		<select name="repo" bind:value={acceptRepo} aria-label="Target repository">
			{#each repos as repo (repo)}
				<option value={repo}>{repo}</option>
			{/each}
		</select>

		<select name="priority" bind:value={priority} aria-label="Priority">
			<option value="">No priority</option>
			{#each PRIORITY_OPTIONS as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>

		<select name="size" bind:value={size} aria-label="Size">
			<option value="">No size</option>
			{#each SIZE_OPTIONS as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>

		<button class="btn btn--primary" type="submit" disabled={acceptPending}>
			{#if acceptPending}<Spinner size={12} />{/if}
			Accept
		</button>
	</form>

	<div class="actions actions--secondary">
		<form
			method="POST"
			action="?/dismiss"
			use:enhance={() => {
				dismissPending = true;
				return async ({ update }) => {
					await update({ reset: false });
					dismissPending = false;
				};
			}}
		>
			<input type="hidden" name="id" value={submission.id} />
			<button class="btn" type="submit" disabled={dismissPending}>
				{#if dismissPending}<Spinner size={12} />{/if}
				Dismiss
			</button>
		</form>

		<button
			class="btn"
			type="button"
			onclick={() => (duplicating = !duplicating)}
			aria-expanded={duplicating}
		>
			Duplicate
		</button>
	</div>

	{#if duplicating}
		<form
			class="actions actions--duplicate"
			method="POST"
			action="?/duplicate"
			use:enhance={() => {
				duplicatePending = true;
				return async ({ update }) => {
					await update({ reset: false });
					duplicatePending = false;
				};
			}}
		>
			<input type="hidden" name="id" value={submission.id} />
			<select name="repo" bind:value={duplicateRepo} aria-label="Existing issue repository">
				{#each repos as repo (repo)}
					<option value={repo}>{repo}</option>
				{/each}
			</select>
			<input
				class="number-input"
				name="number"
				type="number"
				min="1"
				placeholder="#issue"
				bind:value={duplicateNumber}
				aria-label="Existing issue number"
			/>
			<button class="btn btn--primary" type="submit" disabled={duplicatePending}>
				{#if duplicatePending}<Spinner size={12} />{/if}
				Duplicate
			</button>
		</form>
	{/if}
</article>

<style>
	.submission {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		padding: var(--space-md);
		border-bottom: 1px solid var(--color-border-subtle);
		background: color-mix(in srgb, var(--color-accent-cyan) 5%, transparent);
	}

	.submission__head {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}

	.badge {
		display: inline-flex;
		align-items: center;
		height: 16px;
		padding: 0 var(--space-xs);
		border-radius: var(--radius-xs);
		background: color-mix(in srgb, var(--color-accent-cyan) 18%, transparent);
		color: var(--color-accent-cyan);
		font-size: var(--text-xs);
		font-weight: var(--weight-medium);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.badge--muted {
		background: var(--color-surface-layer-2);
		color: var(--color-text-muted);
		text-transform: none;
	}

	.time {
		margin-left: auto;
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.submission__title {
		margin: 0;
		font-size: var(--text-md);
		font-weight: var(--weight-semibold);
	}

	.submission__body {
		font-size: var(--text-base);
		color: var(--color-text-secondary);
		max-height: 120px;
		overflow: hidden;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		flex-wrap: wrap;
	}

	.actions select,
	.number-input {
		height: 28px;
		padding: 0 var(--space-sm);
		background: var(--color-surface-layer-2);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
	}

	.number-input {
		width: 96px;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		height: 28px;
		padding: 0 var(--space-md);
		background: var(--color-surface-layer-2);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		color: var(--color-text-primary);
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.btn--primary {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: var(--color-on-primary);
		font-weight: var(--weight-medium);
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.actions--secondary {
		gap: var(--space-sm);
	}

	.actions--duplicate {
		padding-top: var(--space-xs);
		border-top: 1px dashed var(--color-border-subtle);
	}
</style>
