<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button } from '@sveltestrap/sveltestrap';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import type { EpicRef } from '#lib/server/issues/types';
	import {
		canManage,
		epicHref,
		epicPropertyState
	} from './inspector-format';

	/**
	 * Epic membership in the Inspector (SPEC §5): one compact relationship near
	 * the title. A child links to its parent epic; an epic links to itself and
	 * keeps its writer-only remove action. The "mark as epic" action lives in
	 * the secondary Details disclosure when there is no relationship to show.
	 * Children are added and reordered from the epic page, not here.
	 */
	interface Props {
		issue: { isEpic?: boolean };
		parent: EpicRef | null;
		repo: string;
		number: number;
		mayWrite: boolean;
	}

	let { issue, parent, repo, number, mayWrite }: Props = $props();

	let busy = $state(false);
	let error = $state<string | null>(null);

	const propertyState = $derived(epicPropertyState({ isEpic: issue.isEpic, parent }));
	const editable = $derived(canManage(mayWrite, busy));

	async function toggle(): Promise<void> {
		if (!editable) return;
		busy = true;
		error = null;
		const slash = repo.indexOf('/');
		const owner = slash > 0 ? repo.slice(0, slash) : repo;
		const name = slash > 0 ? repo.slice(slash + 1) : '';
		try {
			const response = await fetch(
				`/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues/${number}/epic`,
				{
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ is_epic: !issue.isEpic })
				}
			);
			if (!response.ok) {
				const payload = (await response.json().catch(() => null)) as {
					message?: string;
				} | null;
				error = payload?.message ?? 'Could not update epic membership.';
				return;
			}
			await invalidateAll();
		} catch {
			error = 'Could not reach the server. Check the connection and try again.';
		} finally {
			busy = false;
		}
	}
</script>

{#if propertyState === 'child' && parent}
	<div class="d-flex min-w-0 flex-wrap align-items-center gap-2 small">
		<span class="d-inline-flex flex-shrink-0 align-items-center gap-1 text-body-secondary">
			<i class="bi bi-layers" aria-hidden="true"></i>
			Epic
		</span>
		<a
			href={epicHref(parent.repo, parent.number)}
			class="link-primary d-flex min-w-0 align-items-center gap-1 text-decoration-none"
			title={`${parent.repo}#${parent.number} · ${parent.title}`}
		>
			<span class="font-monospace flex-shrink-0">{parent.repo}#{parent.number}</span>
			<span class="text-truncate text-body-secondary">· {parent.title}</span>
		</a>
	</div>
{:else if propertyState === 'epic'}
	<div class="d-flex min-w-0 flex-wrap align-items-center gap-2 small">
		<a
			href={epicHref(repo, number)}
			class="link-primary d-inline-flex flex-shrink-0 align-items-center gap-2 text-decoration-none"
		>
			<i class="bi bi-layers" aria-hidden="true"></i>
			Epic
		</a>
		{#if mayWrite}
			<Button
				color="link"
				size="sm"
				class="text-decoration-none px-1 py-0"
				disabled={!editable}
				onclick={toggle}
			>
				{#if busy}<Spinner size={12} class="me-1" />{/if}
				Remove epic
			</Button>
		{/if}
	</div>
{:else if mayWrite}
	<Button
		color="link"
		size="sm"
		class="text-decoration-none px-0 py-0"
		disabled={!editable}
		onclick={toggle}
	>
		{#if busy}<Spinner size={12} class="me-1" />{/if}
		<i class="bi bi-layers me-1" aria-hidden="true"></i>
		Mark as epic
	</Button>
{/if}

{#if error}
	<p class="w-100 small text-danger mb-0" role="alert">{error}</p>
{/if}
