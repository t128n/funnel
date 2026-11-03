<script lang="ts">
	import {
		Button,
		Dropdown,
		DropdownItem,
		DropdownMenu,
		DropdownToggle,
		Table
	} from '@sveltestrap/sveltestrap';
	import EmptyState from '#lib/components/common/EmptyState.svelte';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import StatusText from '#lib/components/common/StatusText.svelte';
	import { issuePath } from '#lib/issue-url';
	import { formatMinutes } from '#lib/planning';
	import type { EpicChild } from '#lib/server/epics/queries';

	/**
	 * The ordered child table. Missing children stay visible as unavailable
	 * placeholders so a written ref never silently disappears from the epic.
	 * Writers get a remove control; readers see the same rows without one.
	 *
	 * A dense Bootstrap table replaces the old bordered grid. Removal lives in
	 * the row menu and on a hover/focus action beside it.
	 */
	interface Props {
		children: EpicChild[];
		mayWrite?: boolean;
		onremove?: (ref: string) => void;
		removing?: string | null;
	}

	let { children, mayWrite = false, onremove, removing = null }: Props = $props();
</script>

<div data-testid="epic-children">
	{#if children.length === 0}
		<EmptyState
			title="No children yet."
			description="Add open issues from this page."
			class="border-top"
		/>
	{:else}
		<Table hover responsive size="sm" class="align-middle funnel-table">
			<thead>
				<tr>
					<th scope="col">Issue</th>
					<th scope="col">Status</th>
					<th scope="col" class="text-end">Estimate</th>
					<th scope="col" class="text-end">Actual</th>
					<th scope="col" class="text-end">Delay</th>
					<th scope="col" class="text-end">
						<span class="visually-hidden">Actions</span>
					</th>
				</tr>
			</thead>
			<tbody>
				{#each children as item (item.ref)}
					<tr>
						<td class="min-w-0">
							{#if item.available}
								<a href={issuePath('issues', item.repo, item.number)} class="d-flex min-w-0 align-items-center gap-2">
									<span class="font-monospace flex-shrink-0 text-body-secondary">
										{item.repo}#{item.number}
									</span>
									<span
										class="min-w-0 text-truncate text-body"
										class:text-decoration-line-through={item.state === 'closed'}
									>
										{item.title || 'Untitled issue'}
									</span>
								</a>
							{:else}
								<span class="d-flex min-w-0 align-items-center gap-2 text-body-tertiary" title="Not mirrored">
									<span class="font-monospace flex-shrink-0">{item.ref}</span>
									<span class="text-truncate text-body fst-italic">Unavailable</span>
								</span>
							{/if}
						</td>
						<td>
							{#if item.available}
								<StatusText status={item.status} state={item.state} />
							{:else}
								<span class="small text-body-tertiary">Unavailable</span>
							{/if}
						</td>
						<td class="font-monospace text-end text-nowrap">
							{item.available ? formatMinutes(item.estimateMinutes) : '—'}
						</td>
						<td class="font-monospace text-end text-nowrap">
							{item.available ? formatMinutes(item.actualMinutes) : '—'}
						</td>
						<td class="font-monospace text-end text-nowrap">
							{item.available ? formatMinutes(item.delayMinutes) : '—'}
						</td>
						<td>
							{#if mayWrite && onremove}
								<div class="d-flex align-items-center justify-content-end gap-1">
									<span class="remove-action d-flex">
										<Button
											color="link"
											size="sm"
											class="text-body-secondary text-decoration-none px-1 py-0"
											disabled={removing === item.ref}
											title="Remove from epic"
											aria-label={`Remove ${item.ref} from the epic`}
											onclick={() => onremove?.(item.ref)}
										>
											{#if removing === item.ref}
												<Spinner label="Removing" />
											{:else}
												<i class="bi bi-x-lg" aria-hidden="true"></i>
											{/if}
										</Button>
									</span>

									<Dropdown>
										<DropdownToggle
											color="link"
											size="sm"
											class="text-body-secondary text-decoration-none px-1 py-0"
											disabled={removing === item.ref}
											aria-label={`Actions for ${item.ref}`}
										>
											<i class="bi bi-three-dots" aria-hidden="true"></i>
										</DropdownToggle>
										<DropdownMenu end>
											<DropdownItem header>{item.ref}</DropdownItem>
											<DropdownItem divider />
											<DropdownItem
												class="text-danger"
												disabled={removing === item.ref}
												on:click={() => onremove?.(item.ref)}
											>
												Remove from epic
											</DropdownItem>
										</DropdownMenu>
									</Dropdown>
								</div>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</Table>
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
