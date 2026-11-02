<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import { Button } from '#lib/components/ui/button';
	import type { EpicRef } from '#lib/server/issues/types';
	import LayersIcon from '@lucide/svelte/icons/layers';
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
	<div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-caption">
		<span class="inline-flex shrink-0 items-center gap-1 font-semibold text-fg-secondary">
			<LayersIcon class="size-3.5" aria-hidden="true" />
			Epic
		</span>
		<a
			href={epicHref(parent.repo, parent.number)}
			class="link flex min-w-0 items-center gap-1"
			title={`${parent.repo}#${parent.number} · ${parent.title}`}
		>
			<span class="mono shrink-0">{parent.repo}#{parent.number}</span>
			<span class="truncate text-fg-secondary">· {parent.title}</span>
		</a>
	</div>
{:else if propertyState === 'epic'}
	<div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-caption">
		<a
			href={epicHref(repo, number)}
			class="inline-flex shrink-0 items-center gap-1.5 font-semibold text-fg hover:text-primary"
		>
			<LayersIcon class="size-3.5" aria-hidden="true" />
			Epic
		</a>
		{#if mayWrite}
			<Button variant="ghost" size="xs" disabled={!editable} onclick={toggle}>
				{#if busy}<Spinner size={12} />{/if}
				Remove epic
			</Button>
		{/if}
	</div>
{:else if mayWrite}
	<Button variant="ghost" size="xs" disabled={!editable} onclick={toggle}>
		{#if busy}<Spinner size={12} />{/if}
		<LayersIcon class="size-4" aria-hidden="true" />
		Mark as epic
	</Button>
{/if}

{#if error}
	<p class="w-full text-caption text-error" role="alert">{error}</p>
{/if}
