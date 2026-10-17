<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import { PRIORITY_OPTIONS, SIZE_OPTIONS } from '#lib/labels';
	import { clearSelection } from '#lib/client/selection.svelte';
	import { absoluteTime, relativeTime } from '#lib/time';
	import type { StagedSubmission } from '#lib/server/intake/staging';

	/**
	 * Document-style detail pane for a staged intake submission (SPEC §6.2).
	 * Mirrors the Inspector Pane: full body on top, triage actions pinned at the
	 * base. The accept / dismiss / duplicate forms post to the Inbox page actions.
	 */
	interface Props {
		submission: StagedSubmission;
		repos: string[];
		defaultRepo: string;
	}

	let { submission, repos, defaultRepo }: Props = $props();

	type Pending = 'accept' | 'dismiss' | 'duplicate' | null;
	let pending = $state<Pending>(null);

	let acceptRepo = $state(untrack(() => defaultRepo || repos[0] || ''));
	let priority = $state('');
	let size = $state('');
	let duplicating = $state(false);
	let duplicateRepo = $state(untrack(() => defaultRepo || repos[0] || ''));
	let duplicateNumber = $state('');

	/** Apply a decision's result: refresh, clear the busy flag, and — since a
	 *  staged row is hard-deleted on every decision — drop the selection so the
	 *  canvas returns to its empty state instead of a stale id. */
	async function settle(
		result: { type: string },
		update: (opts?: { reset: boolean }) => Promise<void>
	) {
		await update({ reset: false });
		pending = null;
		if (result.type === 'success') clearSelection();
	}
</script>

<aside class="submission-detail" aria-label="Intake submission">
	<header class="sd__head">
		<div class="sd__crumb">
			<span class="badge">intake</span>
			{#if submission.source}
				<span class="badge badge--muted mono">{submission.source}</span>
			{/if}
		</div>
		<div class="sd__actions">
			<button
				class="icon-btn"
				type="button"
				title="Close"
				aria-label="Close detail"
				onclick={clearSelection}
			>
				<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
					<path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.4" />
				</svg>
			</button>
		</div>
	</header>

	<div class="sd__body">
		<h1 class="sd__title">{submission.title}</h1>
		<div class="sd__meta">
			Staged
			<span title={absoluteTime(submission.createdAt)}>· {relativeTime(submission.createdAt)}</span>
		</div>

		{#if submission.body.trim().length > 0}
			<div class="sd__content plain-text">{submission.body}</div>
		{:else}
			<div class="sd__content muted">No description provided.</div>
		{/if}
	</div>

	<footer class="sd__triage">
		<form
			class="triage-row"
			method="POST"
			action="?/accept"
			use:enhance={() => {
				pending = 'accept';
				return async ({ result, update }) => {
					await settle(result, update);
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

			<button class="btn btn--primary" type="submit" disabled={pending !== null}>
				{#if pending === 'accept'}<Spinner size={12} />{/if}
				Accept
			</button>
		</form>

		<div class="triage-row triage-row--secondary">
			<form
				method="POST"
				action="?/dismiss"
				use:enhance={() => {
					pending = 'dismiss';
					return async ({ result, update }) => {
					await settle(result, update);
				};
				}}
			>
				<input type="hidden" name="id" value={submission.id} />
				<button class="btn" type="submit" disabled={pending !== null}>
					{#if pending === 'dismiss'}<Spinner size={12} />{/if}
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
				class="triage-row triage-row--duplicate"
				method="POST"
				action="?/duplicate"
				use:enhance={() => {
					pending = 'duplicate';
					return async ({ result, update }) => {
					await settle(result, update);
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
				<button class="btn btn--primary" type="submit" disabled={pending !== null}>
					{#if pending === 'duplicate'}<Spinner size={12} />{/if}
					Duplicate
				</button>
			</form>
		{/if}
	</footer>
</aside>

<style>
	.submission-detail {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
		height: 100%;
		background: var(--color-surface-layer-1);
		overflow: hidden;
	}

	.sd__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-sm);
		height: var(--island-header-height);
		padding: 0 var(--space-lg);
		background: var(--color-island-header);
		flex: none;
	}

	.sd__crumb {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		overflow: hidden;
	}

	.badge {
		display: inline-flex;
		align-items: center;
		height: 18px;
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

	.sd__actions {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
	}

	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border-radius: var(--radius-sm);
		border: 1px solid transparent;
		background: transparent;
		color: var(--color-text-muted);
		cursor: pointer;
	}

	.icon-btn:hover {
		background: var(--color-surface-layer-2);
		color: var(--color-text-primary);
	}

	.sd__body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		padding: var(--space-xl) var(--space-lg);
	}

	.sd__title {
		margin: 0;
		font-size: var(--text-xl);
		font-weight: var(--weight-semibold);
		letter-spacing: -0.015em;
		line-height: 1.2;
		color: var(--color-text-primary);
	}

	.sd__meta {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.sd__content {
		margin-top: var(--space-sm);
		font-size: var(--text-base);
		line-height: 1.6;
		color: var(--color-text-secondary);
	}

	.muted {
		color: var(--color-text-muted);
	}

	.sd__triage {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		padding: var(--space-md) var(--space-lg);
		background: var(--color-island-header);
		flex: none;
	}

	.triage-row {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		flex-wrap: wrap;
	}

	.triage-row--secondary {
		gap: var(--space-sm);
	}

	.triage-row--duplicate {
		padding-top: var(--space-xs);
		border-top: 1px dashed var(--color-border-subtle);
	}

	.triage-row select,
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
</style>
