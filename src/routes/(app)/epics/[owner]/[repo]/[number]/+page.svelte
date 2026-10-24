<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import AddChildDialog from '#lib/components/epics/AddChildDialog.svelte';
	import EpicChildTable from '#lib/components/epics/EpicChildTable.svelte';
	import EpicRollups from '#lib/components/epics/EpicRollups.svelte';
	import { epicChildErrorMessage, removeChildRequest, type EpicCandidate } from '#lib/components/epics/epic-actions';
	import { Button } from '#lib/components/ui/button';
	import { issuePath } from '#lib/issue-url';
	import { canWrite } from '#lib/roles';
	import type { EpicDetail } from '#lib/server/epics/queries';
	import PlusIcon from '@lucide/svelte/icons/plus';

	interface PageData {
		epic?: EpicDetail;
		candidates?: EpicCandidate[];
		user?: { role?: unknown } | null;
	}

	let { data }: { data: PageData } = $props();

	let dialogOpen = $state(false);
	let removing = $state<string | null>(null);
	let error = $state<string | null>(null);

	const epic = $derived(data.epic);
	const candidates = $derived(data.candidates ?? []);
	const childRefs = $derived(epic?.children.map((child) => child.ref) ?? []);
	const mayWrite = $derived(canWrite(data.user?.role));

	async function remove(ref: string) {
		if (!epic || removing !== null) return;
		removing = ref;
		error = null;
		const request = removeChildRequest(
			epic.repo,
			epic.number,
			childRefs,
			ref
		);
		try {
			const response = await fetch(request.url, {
				method: request.method,
				headers: { 'Content-Type': 'application/json' },
				body: request.body
			});
			if (!response.ok) {
				const payload = await response.json().catch(() => null);
				error = epicChildErrorMessage(response.status, payload);
				return;
			}
			await invalidateAll();
		} catch {
			error = 'Could not reach the server. Check the connection and try again.';
		} finally {
			removing = null;
		}
	}
</script>

{#if epic}
	<PageHead
		title={epic.title || 'Epic'}
		description={`Epic ${epic.ref} with ${epic.childCount} children and time rollups.`}
	/>

	<div class="surface-shell bg-[var(--surface-canvas)] flex min-h-0 flex-1 flex-col overflow-y-auto">
		<header
			class="border-[color:var(--surface-divider)] flex flex-col gap-2 border-b px-3 py-2"
		>
			<div class="flex min-w-0 flex-wrap items-center gap-2">
				<a href="/epics" class="text-muted-foreground hover:text-foreground shrink-0 text-xs">
					← Epics
				</a>
				<h1 class="min-w-0 flex-1 truncate text-base font-semibold tracking-tight">
					{epic.title || 'Untitled epic'}
				</h1>
				{#if epic.state === 'closed'}
					<span class="text-muted-foreground shrink-0 text-[11px]">closed</span>
				{/if}
				{#if mayWrite}
					<Button size="sm" onclick={() => (dialogOpen = true)}>
						<PlusIcon />
						Add child
					</Button>
				{/if}
			</div>

			<div class="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
				<a
					href={issuePath('issues', epic.repo, epic.number)}
					class="hover:text-foreground tabular-nums hover:underline"
				>
					{epic.ref}
				</a>
				{#if epic.milestone}
					<span class="tabular-nums">
						{epic.milestone.title}
						{#if epic.milestone.dueOn !== null}
							· due {new Date(epic.milestone.dueOn).toISOString().slice(0, 10)}
						{/if}
					</span>
				{/if}
			</div>
		</header>

		{#if mayWrite}
			<AddChildDialog
				open={dialogOpen}
				epicRepo={epic.repo}
				epicNumber={epic.number}
				children={childRefs}
				{candidates}
				onopenchange={(open) => (dialogOpen = open)}
			/>
		{/if}

		<div class="mx-auto flex w-full max-w-5xl flex-col gap-3 p-4">
			<EpicRollups summary={epic} />

			{#if error}
				<p class="text-destructive text-xs" role="alert" data-testid="epic-page-error">{error}</p>
			{/if}

			<EpicChildTable
				children={epic.children}
				{mayWrite}
				onremove={remove}
				{removing}
			/>
		</div>
	</div>
{/if}
