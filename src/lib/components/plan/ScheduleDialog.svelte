<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import { Button } from '#lib/components/ui/button';
	import * as Dialog from '#lib/components/ui/dialog';
	import * as Field from '#lib/components/ui/field';
	import { Input } from '#lib/components/ui/input';
	import type { PlanningIssue } from '#lib/server/planning/queries';
	import { cn } from '#lib/utils';
	import { scheduleErrorMessage, scheduleRequest } from './schedule';

	/**
	 * Schedule one candidate issue to the week currently in view.
	 *
	 * The dialog owns its request: a successful PUT reloads the page data, while
	 * a 409 keeps the dialog open and shows the server's cap message inline so
	 * the user can pick a smaller issue or a different week.
	 */
	interface Props {
		open: boolean;
		/** Monday `YYYY-MM-DD` of the week receiving the issue. */
		week: string;
		candidates: PlanningIssue[];
		onopenchange: (open: boolean) => void;
	}

	let { open, week, candidates, onopenchange }: Props = $props();

	let query = $state('');
	let selectedKey = $state<string | null>(null);
	let busy = $state(false);
	let error = $state<string | null>(null);

	function issueKey(issue: PlanningIssue): string {
		return `${issue.repo}#${issue.number}`;
	}

	const selected = $derived(
		candidates.find((issue) => issueKey(issue) === selectedKey) ?? null
	);
	const filtered = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		if (needle.length === 0) return candidates;
		return candidates.filter(
			(issue) =>
				issue.title.toLowerCase().includes(needle) ||
				issue.repo.toLowerCase().includes(needle) ||
				String(issue.number).includes(needle)
		);
	});

	// Every open starts clean: a previous 409 must not leak into the next issue.
	$effect(() => {
		if (open) {
			query = '';
			selectedKey = null;
			error = null;
			busy = false;
		}
	});

	function close(next: boolean) {
		if (busy) return;
		onopenchange(next);
	}

	async function submit() {
		if (selected === null || busy) return;
		busy = true;
		error = null;
		const request = scheduleRequest(selected.repo, selected.number, week);
		try {
			const response = await fetch(request.url, {
				method: request.method,
				headers: { 'Content-Type': 'application/json' },
				body: request.body
			});
			if (response.status === 409) {
				const payload = await response.json().catch(() => null);
				error = scheduleErrorMessage(409, payload);
				return;
			}
			if (!response.ok) {
				const payload = await response.json().catch(() => null);
				error = scheduleErrorMessage(response.status, payload);
				return;
			}
			await invalidateAll();
			onopenchange(false);
		} catch {
			error = 'Could not reach the server. Check the connection and try again.';
		} finally {
			busy = false;
		}
	}
</script>

<Dialog.Root {open} onOpenChange={close}>
	<Dialog.Content class="sm:max-w-[min(var(--layout-dialog-width-wide),calc(100%-2rem))]">
		<Dialog.Header>
			<Dialog.Title>Schedule Issue</Dialog.Title>
			<Dialog.Description>
				Add an open, sized issue to the week of {week}. GitHub sizes and assignees stay the
				source of truth.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex min-w-0 flex-col gap-3">
			<Field.Field>
				<Field.Label for="plan-candidate-search">Find an issue</Field.Label>
				<Input
					id="plan-candidate-search"
					type="search"
					placeholder="Search by title, repo or number"
					bind:value={query}
					autocomplete="off"
				/>
				<Field.Description>
					Showing open, sized issues that are not already planned.
				</Field.Description>
			</Field.Field>

			{#if candidates.length === 0}
				<EmptyState
					title="No candidates."
					description="No open, sized issues are available. Estimate and triage an issue first."
					class="border-y border-border-subtle py-6"
				/>
			{:else if filtered.length === 0}
				<p class="border-y border-border-subtle py-3 text-body text-fg-secondary">
					No issue matches “{query}”.
				</p>
			{:else}
				<ul
					class="max-h-64 overflow-y-auto border-y border-border-subtle"
					aria-label="Schedule candidates"
				>
					{#each filtered as issue (issueKey(issue))}
						<li>
							<button
								type="button"
								class={cn(
									'flex min-h-(--size-row-compact) w-full min-w-0 items-center gap-2 border-b border-border-subtle px-2 text-start last:border-b-0',
									selectedKey === issueKey(issue) ? 'bg-surface-2' : 'hover:bg-surface'
								)}
								aria-pressed={selectedKey === issueKey(issue)}
								onclick={() => {
									selectedKey = issueKey(issue);
									error = null;
								}}
							>
								<span class="mono shrink-0 text-caption text-fg-secondary tabular-nums">
									{issue.repo}#{issue.number}
								</span>
								<span class="min-w-0 flex-1 truncate text-body text-fg">{issue.title}</span>
								<span class="shrink-0 text-caption text-fg-secondary">
									{issue.size?.toUpperCase() ?? '—'}
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}

			{#if error}
				<div data-testid="schedule-error">
					<InlineStatus tone="error" message={error} />
				</div>
			{/if}
		</div>

		<Dialog.Footer>
			<Button variant="outline" size="sm" disabled={busy} onclick={() => close(false)}>
				Cancel
			</Button>
			<Button size="sm" disabled={busy || selected === null} onclick={() => void submit()}>
				{#if busy}
					<Spinner />
					<span>Scheduling…</span>
				{:else}
					<span>Schedule Issue</span>
				{/if}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
