<script lang="ts">
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import XIcon from '@lucide/svelte/icons/x';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import StatusText from '#lib/components/common/StatusText.svelte';
	import { Button } from '#lib/components/ui/button';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu';
	import { issuePath } from '#lib/issue-url';
	import { formatMinutes } from '#lib/planning';
	import type { EpicChild } from '#lib/server/epics/queries';

	/**
	 * The ordered child table. Missing children stay visible as unavailable
	 * placeholders so a written ref never silently disappears from the epic.
	 * Writers get a remove control; readers see the same rows without one.
	 *
	 * A ruled `.data-table` replaces the old bordered grid. Removal lives in the
	 * row menu and on a hover/focus action beside it.
	 */
	interface Props {
		children: EpicChild[];
		mayWrite?: boolean;
		onremove?: (ref: string) => void;
		removing?: string | null;
	}

	let { children, mayWrite = false, onremove, removing = null }: Props = $props();
</script>

<div class="overflow-x-auto" data-testid="epic-children">
	{#if children.length === 0}
		<EmptyState
			title="No children yet."
			description="Add open issues from this page."
			class="border-t border-border-subtle py-10"
		/>
	{:else}
		<table class="data-table">
			<thead>
				<tr>
					<th>Issue</th>
					<th>Status</th>
					<th class="text-end">Estimate</th>
					<th class="text-end">Actual</th>
					<th class="text-end">Delay</th>
					<th class="data-table-actions">
						<span class="sr-only">Actions</span>
					</th>
				</tr>
			</thead>
			<tbody>
				{#each children as item (item.ref)}
					<tr>
						<td class="min-w-0">
							{#if item.available}
								<a
									href={issuePath('issues', item.repo, item.number)}
									class="flex min-w-0 items-center gap-2"
								>
									<span class="mono shrink-0 text-fg-secondary">
										{item.repo}#{item.number}
									</span>
									<span
										class="min-w-0 truncate text-body"
										class:line-through={item.state === 'closed'}
									>
										{item.title || 'Untitled issue'}
									</span>
								</a>
							{:else}
								<span
									class="flex min-w-0 items-center gap-2 text-fg-muted"
									title="Not mirrored"
								>
									<span class="mono shrink-0">{item.ref}</span>
									<span class="truncate text-body italic">Unavailable</span>
								</span>
							{/if}
						</td>
						<td>
							{#if item.available}
								<StatusText status={item.status} state={item.state} />
							{:else}
								<span class="text-caption text-fg-muted">Unavailable</span>
							{/if}
						</td>
						<td class="mono text-end whitespace-nowrap">
							{item.available ? formatMinutes(item.estimateMinutes) : '—'}
						</td>
						<td class="mono text-end whitespace-nowrap">
							{item.available ? formatMinutes(item.actualMinutes) : '—'}
						</td>
						<td class="mono text-end whitespace-nowrap">
							{item.available ? formatMinutes(item.delayMinutes) : '—'}
						</td>
						<td>
							{#if mayWrite && onremove}
								<div class="flex items-center justify-end gap-1">
									<span class="remove-action flex">
										<Button
											variant="ghost"
											size="icon-sm"
											class="text-fg-secondary"
											disabled={removing === item.ref}
											title="Remove from epic"
											aria-label={`Remove ${item.ref} from the epic`}
											onclick={() => onremove?.(item.ref)}
										>
											{#if removing === item.ref}
												<Spinner label="Removing" />
											{:else}
												<XIcon />
											{/if}
										</Button>
									</span>

									<DropdownMenu.Root>
										<DropdownMenu.Trigger>
											{#snippet child({ props })}
												<Button
													{...props}
													variant="ghost"
													size="icon-sm"
													class="text-fg-secondary"
													disabled={removing === item.ref}
													aria-label={`Actions for ${item.ref}`}
												>
													<EllipsisIcon />
												</Button>
											{/snippet}
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end" class="w-(--layout-menu-min)">
											<DropdownMenu.Label>{item.ref}</DropdownMenu.Label>
											<DropdownMenu.Separator />
											<DropdownMenu.Item
												variant="destructive"
												disabled={removing === item.ref}
												onSelect={() => onremove?.(item.ref)}
											>
												Remove from epic
											</DropdownMenu.Item>
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								</div>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>

<style>
	.remove-action {
		opacity: 1;
	}

	@media (hover: hover) and (pointer: fine) {
		.remove-action {
			opacity: 0;
		}

		tr:hover .remove-action,
		tr:focus-within .remove-action {
			opacity: 1;
		}
	}
</style>
