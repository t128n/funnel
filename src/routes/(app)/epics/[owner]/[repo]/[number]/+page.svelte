<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button } from '@sveltestrap/sveltestrap';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import AddChildDialog from '#lib/components/epics/AddChildDialog.svelte';
	import EpicChildTable from '#lib/components/epics/EpicChildTable.svelte';
	import EpicRollups from '#lib/components/epics/EpicRollups.svelte';
	import {
		epicChildErrorMessage,
		removeChildRequest,
		type EpicCandidate
	} from '#lib/components/epics/epic-actions';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import StatusText from '#lib/components/common/StatusText.svelte';
	import { issuePath } from '#lib/issue-url';
	import { canWrite } from '#lib/roles';
	import type { EpicDetail } from '#lib/server/epics/queries';

	interface PageData {
		epic?: EpicDetail;
		candidates?: EpicCandidate[];
		user?: { role?: unknown } | null;
	}

	let { data }: { data: PageData } = $props();

	let dialogOpen = $state(false);
	let removing = $state<string | null>(null);
	let error = $state<string | null>(null);
	let failedRef = $state<string | null>(null);

	const epic = $derived(data.epic);
	const candidates = $derived(data.candidates ?? []);
	const childRefs = $derived(epic?.children.map((child) => child.ref) ?? []);
	const mayWrite = $derived(canWrite(data.user?.role));

	function dueLabel(dueOn: number): string {
		return new Date(dueOn).toISOString().slice(0, 10);
	}

	async function remove(ref: string) {
		if (!epic || removing !== null) return;
		removing = ref;
		error = null;
		failedRef = null;
		const request = removeChildRequest(epic.repo, epic.number, childRefs, ref);
		try {
			const response = await fetch(request.url, {
				method: request.method,
				headers: { 'Content-Type': 'application/json' },
				body: request.body
			});
			if (!response.ok) {
				const payload = await response.json().catch(() => null);
				error = epicChildErrorMessage(response.status, payload);
				failedRef = ref;
				return;
			}
			await invalidateAll();
		} catch {
			error = 'Could not reach the server. Check the connection and try again.';
			failedRef = ref;
		} finally {
			removing = null;
		}
	}

	async function retry() {
		if (failedRef !== null) await remove(failedRef);
	}
</script>

{#snippet epicActions()}
	{#if mayWrite}
		<Button onclick={() => (dialogOpen = true)}>
			<i class="bi bi-plus-lg me-1" aria-hidden="true"></i>
			Add child
		</Button>
	{/if}
{/snippet}

{#snippet retryAction()}
	<Button color="link" size="sm" class="text-decoration-none" onclick={() => void retry()}>
		Retry
	</Button>
{/snippet}

{#if epic}
	<PageHead title={epic.title || 'Epic'} />

	<main class="container-xl py-4">
		<PageHeader title={epic.title || 'Untitled epic'} actions={epicActions} />

		<div class="d-flex flex-column gap-3 pb-2">
			<div class="d-flex flex-wrap align-items-baseline column-gap-3 row-gap-1 small text-body-secondary">
				<a
					href={issuePath('issues', epic.repo, epic.number)}
					class="link-primary link-underline-opacity-0 link-underline-opacity-100-hover"
				>
					{epic.ref}
				</a>
				{#if epic.milestone}
					<span>
						{epic.milestone.title}
						{#if epic.milestone.dueOn !== null}
							· due {dueLabel(epic.milestone.dueOn)}
						{/if}
					</span>
				{/if}
				<StatusText status={epic.issue.status} state={epic.state} />
			</div>

			<EpicRollups summary={epic} />

			{#if error}
				<div data-testid="epic-page-error">
					<InlineStatus tone="error" message={error} action={retryAction} />
				</div>
			{/if}

			<section aria-labelledby="epic-children-heading">
				<div class="d-flex align-items-baseline gap-2 mb-2">
					<h2 id="epic-children-heading" class="h6 mb-0">Children</h2>
					<span class="small text-body-secondary">{epic.childCount}</span>
				</div>
				<EpicChildTable children={epic.children} {mayWrite} onremove={remove} {removing} />
			</section>
		</div>
	</main>

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
{/if}
