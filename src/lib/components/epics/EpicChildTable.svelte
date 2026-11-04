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
	 * Below `md` only the issue and the actions remain as columns, with status
	 * and the time rollups folded under the title. The time columns return at
	 * `lg`, so the remove control is reachable at every width.
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
		<Table hover responsive size="sm" class="align-middle funnel-table funnel-table--fluid">
			<thead class="table-light small text-body-secondary">
				<tr>
					<th scope="col" class="text-body-secondary">Issue</th>
					<th scope="col" class="text-body-secondary d-none d-md-table-cell" style="width: 8rem;">
						Status
					</th>
					<th scope="col" class="text-body-secondary text-end d-none d-lg-table-cell" style="width: 6rem;">
						Estimate
					</th>
					<th scope="col" class="text-body-secondary text-end d-none d-lg-table-cell" style="width: 6rem;">
						Actual
					</th>
					<th scope="col" class="text-body-secondary text-end d-none d-lg-table-cell" style="width: 6rem;">
						Delay
					</th>
					<th scope="col" class="text-body-secondary text-end" style="width: 5rem;">
						<span class="visually-hidden">Actions</span>
					</th>
				</tr>
			</thead>
			<tbody>
				{#each children as item (item.ref)}
					<tr>
						<td class="min-w-0">
							{#if item.available}
								<div class="min-w-0">
									<a
										href={issuePath('issues', item.repo, item.number)}
										class="d-block d-md-inline link-primary link-underline-opacity-0 link-underline-opacity-100-hover"
									>
										{item.repo}#{item.number}
									</a>
									<span
										class="d-block d-md-inline ms-md-2 min-w-0 text-break text-body"
										class:text-decoration-line-through={item.state === 'closed'}
									>
										{item.title || 'Untitled issue'}
									</span>
								</div>
								<div class="small text-body-secondary d-md-none mt-1 d-flex flex-wrap column-gap-3 text-break">
									<StatusText status={item.status} state={item.state} />
									<span>Estimate {formatMinutes(item.estimateMinutes)}</span>
									<span>Actual {formatMinutes(item.actualMinutes)}</span>
									<span>Delay {formatMinutes(item.delayMinutes)}</span>
								</div>
								<div class="small text-body-secondary d-none d-md-flex d-lg-none mt-1 flex-wrap column-gap-3 text-break">
									<span>Estimate {formatMinutes(item.estimateMinutes)}</span>
									<span>Actual {formatMinutes(item.actualMinutes)}</span>
									<span>Delay {formatMinutes(item.delayMinutes)}</span>
								</div>
							{:else}
								<span class="d-flex min-w-0 align-items-center gap-2 text-body-tertiary" title="Not mirrored">
									<span class="flex-shrink-0">{item.ref}</span>
									<span class="text-break text-body fst-italic">Unavailable</span>
								</span>
							{/if}
						</td>
						<td class="d-none d-md-table-cell">
							{#if item.available}
								<StatusText status={item.status} state={item.state} />
							{:else}
								<span class="small text-body-tertiary">Unavailable</span>
							{/if}
						</td>
						<td class="font-monospace text-end text-nowrap d-none d-lg-table-cell">
							{item.available ? formatMinutes(item.estimateMinutes) : '—'}
						</td>
						<td class="font-monospace text-end text-nowrap d-none d-lg-table-cell">
							{item.available ? formatMinutes(item.actualMinutes) : '—'}
						</td>
						<td class="font-monospace text-end text-nowrap d-none d-lg-table-cell">
							{item.available ? formatMinutes(item.delayMinutes) : '—'}
						</td>
						<td class="text-end">
							{#if mayWrite && onremove}
								<div class="d-flex align-items-center justify-content-end gap-1">
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
