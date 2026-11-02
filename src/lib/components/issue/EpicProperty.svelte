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
	 * Epic membership in the Inspector (SPEC §5): an `Epic` badge and link on
	 * the epic itself, a parent link on a child, and a writer-only mark/remove
	 * toggle otherwise. Children are added from the epic page, not here.
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

{#if propertyState === 'epic'}
	<div class="flex flex-wrap items-center gap-2">
		<a
			href={epicHref(repo, number)}
			class="inline-flex items-center gap-1.5 text-body font-semibold text-fg hover:text-primary"
		>
			<LayersIcon class="size-4" aria-hidden="true" />
			Epic
		</a>
		{#if mayWrite}
			<Button variant="ghost" size="xs" disabled={!editable} onclick={toggle}>
				{#if busy}<Spinner size={12} />{/if}
				Remove epic
			</Button>
		{/if}
	</div>
{:else if propertyState === 'child' && parent}
	<a
		href={epicHref(parent.repo, parent.number)}
		class="inline-flex min-w-0 items-center gap-1.5 text-body text-fg-secondary hover:text-fg"
		title={`${parent.repo}#${parent.number}`}
	>
		<LayersIcon class="size-4 shrink-0" aria-hidden="true" />
		<span class="truncate">Child of {parent.repo}#{parent.number} · {parent.title}</span>
	</a>
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
