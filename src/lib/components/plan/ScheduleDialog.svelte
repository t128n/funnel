<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import { Button } from '#lib/components/primitives/button';
	import * as Dialog from '#lib/components/primitives/dialog';
	import * as Empty from '#lib/components/primitives/empty';
	import * as Field from '#lib/components/primitives/field';
	import { Input } from '#lib/components/primitives/input';
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
	<Dialog.Content class="sm:max-w-lg" aria-describedby={undefined}>
		<Dialog.Header>
			<Dialog.Title class="text-base font-semibold">Schedule issue</Dialog.Title>
			<Dialog.Description class="text-muted-foreground text-xs">
				Add an open, sized issue to the week of {week}. GitHub sizes and assignees stay the
				source of truth.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-3">
			<Field.Field>
				<Field.Label for="plan-candidate-search">Find an issue</Field.Label>
				<Input
					id="plan-candidate-search"
					type="search"
					placeholder="Search by title, repo or number"
					bind:value={query}
					autocomplete="off"
				/>
			</Field.Field>

			{#if candidates.length === 0}
				<Empty.Root class="border-0 p-4">
					<Empty.Description>
						No open, sized issues are available. Estimate and triage an issue first.
					</Empty.Description>
				</Empty.Root>
			{:else if filtered.length === 0}
				<p class="text-muted-foreground py-3 text-xs">No issue matches “{query}”.</p>
			{:else}
				<ul
					class="border-[color:var(--border)] max-h-64 overflow-y-auto rounded border"
					aria-label="Schedule candidates"
				>
					{#each filtered as issue (issueKey(issue))}
						<li>
							<button
								type="button"
								class={cn(
									'focus-visible:ring-ring/50 flex w-full min-w-0 items-center gap-2 border-b border-[color:var(--border)] px-2.5 py-1.5 text-start text-xs outline-none last:border-b-0 focus-visible:ring-2',
									selectedKey === issueKey(issue)
										? 'bg-[var(--accent)]'
										: 'hover:bg-[var(--accent)]'
								)}
								aria-pressed={selectedKey === issueKey(issue)}
								onclick={() => {
									selectedKey = issueKey(issue);
									error = null;
								}}
							>
								<span class="text-muted-foreground shrink-0 tabular-nums">
									{issue.repo}#{issue.number}
								</span>
								<span class="min-w-0 flex-1 truncate">{issue.title}</span>
								<span class="text-muted-foreground shrink-0 text-[10px]">
									{issue.size?.toUpperCase() ?? '—'}
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}

			{#if error}
				<p class="text-destructive text-xs" role="alert" data-testid="schedule-error">{error}</p>
			{/if}
		</div>

		<Dialog.Footer>
			<Button variant="outline" size="sm" disabled={busy} onclick={() => close(false)}>
				Cancel
			</Button>
			<Button size="sm" disabled={busy || selected === null} onclick={() => void submit()}>
				{#if busy}
					<Spinner />
				{/if}
				Schedule
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
