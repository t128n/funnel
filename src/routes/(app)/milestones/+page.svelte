<script lang="ts">
	import PageHead from '#lib/components/common/PageHead.svelte';
	import Avatar from '#lib/components/common/Avatar.svelte';
	import * as Empty from '#lib/components/ui/empty';
	import type { MilestoneItem } from '#lib/server/issues/types';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	function href(milestone: MilestoneItem): string {
		const slash = milestone.repo.indexOf('/');
		const owner = slash > 0 ? milestone.repo.slice(0, slash) : milestone.repo;
		const name = slash > 0 ? milestone.repo.slice(slash + 1) : '';
		return `/milestones/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/${milestone.number}`;
	}

	function dueLabel(dueOn: number | null): string {
		if (dueOn === null) return 'No due date';
		return new Date(dueOn).toISOString().slice(0, 10);
	}

	function percent(progress: number): number {
		return Math.round(progress * 100);
	}
</script>

<PageHead
	title="Milestones"
	description="GitHub milestones across the configured repositories, with progress and due dates."
/>

<div class="surface-shell bg-[var(--surface-canvas)] flex min-h-0 flex-1 flex-col overflow-y-auto">
	<header
		class="border-[color:var(--surface-divider)] flex min-h-11 shrink-0 items-center gap-2 border-b px-3"
	>
		<h1 class="text-base font-semibold tracking-tight">Milestones</h1>
	</header>

	{#if data.groups.length === 0}
		<Empty.Root class="flex-1 border-0">
			<Empty.Description>
				No milestones yet. Create one from an issue, or on GitHub.
			</Empty.Description>
		</Empty.Root>
	{:else}
		<div class="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4">
			{#each data.groups as group (group.repo)}
				<section class="flex flex-col gap-2">
					<h2 class="text-muted-foreground text-xs font-medium tracking-wider uppercase">
						{group.repo}
					</h2>
					<div class="flex flex-col gap-2">
						{#each group.milestones as milestone (milestone.number)}
							<a
								href={href(milestone)}
								class="border-[color:var(--surface-divider)] hover:bg-[var(--surface-card-hover)] flex flex-col gap-2 rounded-lg border p-3 transition-colors"
							>
								<div class="flex min-w-0 items-center gap-2">
									<span class="min-w-0 flex-1 truncate text-sm font-medium">
										{milestone.title || 'Untitled milestone'}
									</span>
									{#if milestone.state === 'closed'}
										<span class="text-muted-foreground shrink-0 text-[11px]">closed</span>
									{/if}
									<span
										class="text-muted-foreground shrink-0 text-[11px] tabular-nums"
										title="Due date"
									>
										{dueLabel(milestone.dueOn)}
									</span>
								</div>

								<div class="flex items-center gap-2">
									<span class="bg-[var(--surface-tag-bg)] h-1.5 min-w-0 flex-1 overflow-hidden rounded-full">
										<span
											class="block h-full rounded-full bg-[var(--surface-accent)]"
											style={`width: ${percent(milestone.progress)}%`}
										></span>
									</span>
									<span class="text-muted-foreground shrink-0 text-[11px] tabular-nums">
										{milestone.closedIssues}/{milestone.closedIssues + milestone.openIssues}
									</span>
								</div>

								{#if milestone.creator}
									<span class="text-muted-foreground flex items-center gap-1.5 text-[11px]">
										<Avatar login={milestone.creator.login} avatarUrl={milestone.creator.avatarUrl} size={14} />
										{milestone.creator.login}
									</span>
								{/if}
							</a>
						{/each}
					</div>
				</section>
			{/each}
		</div>
	{/if}
</div>
