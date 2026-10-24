<script lang="ts">
	import Avatar from '#lib/components/common/Avatar.svelte';
	import { Button } from '#lib/components/ui/button';
	import { issuePath } from '#lib/issue-url';
	import { formatMinutes } from '#lib/planning';
	import type { EpicChild } from '#lib/server/epics/queries';
	import XIcon from '@lucide/svelte/icons/x';

	/**
	 * The ordered child table. Missing children stay visible as unavailable
	 * placeholders so a written ref never silently disappears from the epic.
	 * Writers get a remove control; readers see the same rows without one.
	 */
	interface Props {
		children: EpicChild[];
		mayWrite?: boolean;
		onremove?: (ref: string) => void;
		removing?: string | null;
	}

	let { children, mayWrite = false, onremove, removing = null }: Props = $props();

	function statusLabel(status: string | null): string {
		return status ?? 'untriaged';
	}
</script>

<div
	class="border-[color:var(--surface-divider)] overflow-hidden rounded-lg border"
	data-testid="epic-children"
>
	<div
		class="text-muted-foreground bg-[var(--surface-tag-bg)] grid grid-cols-[minmax(0,1fr)_7rem_5rem_5rem_5rem_2rem] items-center gap-2 px-3 py-1.5 text-[10px] font-medium tracking-wider uppercase"
	>
		<span>Issue</span>
		<span>Status</span>
		<span class="text-end">Estimate</span>
		<span class="text-end">Actual</span>
		<span class="text-end">Delay</span>
		<span></span>
	</div>

	{#if children.length === 0}
		<p class="text-muted-foreground px-3 py-4 text-xs">
			No children yet. Add open issues from this page.
		</p>
	{:else}
		<ul class="flex flex-col">
			{#each children as child (child.ref)}
				<li
					class="border-[color:var(--surface-divider)] grid grid-cols-[minmax(0,1fr)_7rem_5rem_5rem_5rem_2rem] items-center gap-2 border-t px-3 py-1.5 first:border-t-0"
				>
					<div class="flex min-w-0 items-center gap-2">
						{#if child.available}
							<a
								href={issuePath('issues', child.repo, child.number)}
								class="focus-visible:ring-ring/50 min-w-0 flex-1 truncate rounded text-xs outline-none hover:underline focus-visible:ring-2"
							>
								<span class="text-muted-foreground me-1.5 tabular-nums">{child.repo}#{child.number}</span>
								{child.title || 'Untitled issue'}
							</a>
						{:else}
							<span class="text-muted-foreground min-w-0 flex-1 truncate text-xs" title="Not mirrored">
								<span class="me-1.5 tabular-nums">{child.ref}</span>
								unavailable
							</span>
						{/if}
						{#if child.assignees.length > 0}
							<span class="flex shrink-0 items-center gap-1">
								{#each child.assignees.slice(0, 3) as assignee (assignee.login)}
									<Avatar login={assignee.login} avatarUrl={assignee.avatarUrl} size={14} />
								{/each}
							</span>
						{/if}
					</div>
					<span class="min-w-0 truncate text-[11px]">
						{child.available ? statusLabel(child.status) : '—'}
					</span>
					<span class="text-end text-[11px] tabular-nums">
						{child.available ? formatMinutes(child.estimateMinutes) : '—'}
					</span>
					<span class="text-end text-[11px] tabular-nums">
						{child.available ? formatMinutes(child.actualMinutes) : '—'}
					</span>
					<span class="text-end text-[11px] tabular-nums">
						{child.available ? formatMinutes(child.delayMinutes) : '—'}
					</span>
					<span class="flex justify-end">
						{#if mayWrite && onremove}
							<Button
								variant="ghost"
								size="icon-xs"
								disabled={removing === child.ref}
								title="Remove from epic"
								aria-label={`Remove ${child.ref} from the epic`}
								onclick={() => onremove?.(child.ref)}
							>
								<XIcon />
							</Button>
						{/if}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>
