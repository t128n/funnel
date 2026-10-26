<script lang="ts">
	import { Button } from '#lib/components/primitives/button';
	import * as Command from '#lib/components/primitives/command';
	import { Input } from '#lib/components/primitives/input';
	import * as Popover from '#lib/components/primitives/popover';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import { triggerClass } from '#lib/components/primitives/styles';
	import { createRepoMilestone } from '#lib/client/mutations';
	import type { RepoMilestoneRef } from '#lib/server/issues/types';
	import { cn } from '#lib/utils';
	import MilestoneIcon from '@lucide/svelte/icons/milestone';

	/**
	 * Inspector milestone picker. Lists the repo's existing milestones and offers
	 * a lazy "New milestone…" form: GitHub scopes milestones per repository, so
	 * creating one here only ever creates it in the issue's repo. A milestone
	 * that spans repositories is created once per repo that uses it.
	 */
	interface Props {
		repo: string;
		value: RepoMilestoneRef | null;
		options: RepoMilestoneRef[];
		disabled?: boolean;
		onselect: (milestone: RepoMilestoneRef | null) => void;
	}

	let { repo, value, options, disabled = false, onselect }: Props = $props();

	let open = $state(false);
	let creating = $state(false);
	let title = $state('');
	let dueOn = $state('');
	let error = $state<string | null>(null);
	let busy = $state(false);

	/** Current value plus any repo milestone (options already include it). */
	const ordered = $derived.by(() => {
		const seen = new Set<string>();
		const list: RepoMilestoneRef[] = [];
		for (const milestone of options) {
			const key = `${milestone.repo}#${milestone.number}`;
			if (seen.has(key)) continue;
			seen.add(key);
			list.push(milestone);
		}
		return list;
	});

	function choose(milestone: RepoMilestoneRef) {
		onselect(milestone);
		open = false;
	}

	function clear() {
		onselect(null);
		open = false;
	}

	function startCreating() {
		creating = true;
		error = null;
		title = '';
		dueOn = '';
	}

	async function create() {
		const trimmed = title.trim();
		if (!trimmed || busy) return;
		busy = true;
		error = null;
		const result = await createRepoMilestone(repo, {
			title: trimmed,
			dueOn: dueOn.trim() || null
		});
		busy = false;
		if (!result.ok) {
			error = result.error;
			return;
		}
		const due = dueOn.trim() ? Date.parse(dueOn.trim()) : null;
		onselect({
			repo,
			number: result.value.number,
			title: trimmed,
			state: 'open',
			dueOn: due !== null && !Number.isNaN(due) ? due : null
		});
		creating = false;
		open = false;
	}

	function onInteractOutside(event: PointerEvent) {
		const target = event.target;
		if (
			target instanceof Element &&
			target.closest('[data-slot="command"], [data-slot="popover-content"], [data-slot="input"]')
		) {
			event.preventDefault();
		}
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		{disabled}
		class={triggerClass('pill', cn('gap-1.5', value && 'text-foreground'))}
	>
		<span class="inline-flex size-4 shrink-0 items-center justify-center" aria-hidden="true">
			<MilestoneIcon class="size-3.5" />
		</span>
		<span class="max-w-40 truncate">{value?.title ?? 'Milestone'}</span>
	</Popover.Trigger>

	<Popover.Content align="start" sideOffset={6} preventScroll={false} class="w-64 gap-0 p-0" {onInteractOutside}>
		{#if creating}
			<div class="flex flex-col gap-2 p-2">
				<Input
					bind:value={title}
					placeholder="Milestone title"
					autocomplete="off"
					spellcheck="false"
					aria-label="New milestone title"
					onkeydown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							void create();
						}
					}}
				/>
				<Input
					bind:value={dueOn}
					type="date"
					aria-label="Due date"
					onkeydown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							void create();
						}
					}}
				/>
				{#if error}
					<p class="text-destructive text-xs">{error}</p>
				{/if}
				<div class="flex items-center justify-end gap-1">
					<Button
						variant="ghost"
						size="xs"
						onclick={() => (creating = false)}
						disabled={busy}
					>
						Cancel
					</Button>
					<Button
						variant="secondary"
						size="xs"
						onclick={() => void create()}
						disabled={busy || title.trim().length === 0}
					>
						{#if busy}<Spinner size={13} />{:else}Create{/if}
					</Button>
				</div>
			</div>
		{:else}
			<Command.Root>
				<Command.Input placeholder="Search milestones…" />
				<Command.List>
					<Command.Empty>No milestones</Command.Empty>
					<Command.Group>
						{#each ordered as milestone (`${milestone.repo}#${milestone.number}`)}
							<Command.Item
								value={`${milestone.repo}#${milestone.number}#${milestone.title}`}
								data-checked={value?.number === milestone.number && value?.repo === milestone.repo}
								onSelect={() => choose(milestone)}
							>
								<span class="flex-1 truncate">{milestone.title}</span>
								{#if milestone.state === 'closed'}
									<span class="text-muted-foreground shrink-0 text-[10px]">closed</span>
								{/if}
							</Command.Item>
						{/each}
					</Command.Group>
				</Command.List>
				<Command.Separator />
				<Command.Item value="__new__" onSelect={startCreating}>
					<span class="text-muted-foreground">New milestone…</span>
				</Command.Item>
				{#if value}
					<Command.Item value="__clear__" onSelect={clear}>
						<span class="text-muted-foreground">No milestone</span>
					</Command.Item>
				{/if}
			</Command.Root>
		{/if}
	</Popover.Content>
</Popover.Root>
