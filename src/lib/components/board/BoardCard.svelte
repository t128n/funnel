<script lang="ts">
	import Avatar from '#lib/components/common/Avatar.svelte';
	import Chip from '#lib/components/common/Chip.svelte';
	import PriorityIcon from '#lib/components/common/PriorityIcon.svelte';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';
	import * as Item from '#lib/components/ui/item/index.js';
	import {
		clearFocusedCard,
		clearMenuRequest,
		getMenuRequestKey,
		setFocusedCard
	} from '#lib/client/board-ui.svelte';
	import { moveToStatus, requestBlock, requestClose, requestReopen, requestUnblock } from '#lib/client/issue-actions.svelte';
	import { selectIssue } from '#lib/client/selection.svelte';
	import { canonicalLabel, STATUS_OPTIONS } from '#lib/labels';
	import type { IssueListItem } from '#lib/server/issues/types';
	import { cn } from '#lib/utils';
	import BanIcon from '@lucide/svelte/icons/ban';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import GripVerticalIcon from '@lucide/svelte/icons/grip-vertical';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

	interface Props {
		issue: IssueListItem;
	}

	let { issue }: Props = $props();

	const key = $derived(`${issue.repo}#${issue.number}`);
	const closed = $derived(issue.state === 'closed');
	const shortRepo = $derived(issue.repo.split('/')[1] ?? issue.repo);

	/** Non-reserved labels only; reserved groups render as dedicated affordances. */
	const labels = $derived(issue.labels.filter((label) => !canonicalLabel(label)).slice(0, 3));
	const sizeText = $derived(
		issue.size === 'sm' ? 'S' : issue.size === 'md' ? 'M' : issue.size === 'lg' ? 'L' : null
	);

	const stage = $derived(closed ? 'done' : (issue.status ?? ''));
	const stageOptions = $derived([
		...STATUS_OPTIONS,
		{ value: 'done', label: 'Done', color: 'var(--syntax-constant)' }
	]);

	/** The `S` shortcut raises this card's menu via the shared focus store. */
	let menuOpen = $state(false);
	$effect(() => {
		if (getMenuRequestKey() === key) {
			menuOpen = true;
			clearMenuRequest();
		}
	});

	function open() {
		selectIssue(issue.repo, issue.number);
	}

	function onFocusOut(event: FocusEvent) {
		const next = event.relatedTarget as Node | null;
		if (!next || !event.currentTarget || !(event.currentTarget as HTMLElement).contains(next)) {
			clearFocusedCard(key);
		}
	}
</script>

<Item.Root
	variant="outline"
	size="sm"
	class="bg-card hover:bg-accent group/card focus-visible:ring-ring/50 cursor-grab flex-col items-stretch gap-1.5 p-2.5 outline-none focus-visible:ring-1 active:cursor-grabbing"
	role="button"
	tabindex={0}
	aria-label={`${issue.repo}#${issue.number}: ${issue.title}`}
	onclick={open}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			open();
		}
	}}
	onfocusin={() => setFocusedCard(key)}
	onfocusout={onFocusOut}
>
	<div class="flex items-start gap-1.5">
		<Item.Content class="min-w-0 gap-1.5">
			<div class="flex min-w-0 items-center gap-1.5">
				<GripVerticalIcon
					class="text-muted-foreground/50 -ml-1 size-3.5 shrink-0 opacity-0 transition-opacity group-hover/card:opacity-100"
					aria-hidden="true"
				/>
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<span {...props} class="mono text-muted-foreground shrink-0 text-[0.7rem]">
								#{issue.number}
							</span>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>{issue.repo}#{issue.number}</Tooltip.Content>
				</Tooltip.Root>
				{#if closed}
					<span class="text-muted-foreground truncate text-[0.7rem]">Done</span>
				{:else if shortRepo}
					<span class="text-muted-foreground/70 truncate text-[0.7rem]">{shortRepo}</span>
				{/if}
			</div>

			<div
				class={cn(
					'line-clamp-2 text-sm leading-snug font-medium',
					closed ? 'text-muted-foreground' : 'text-foreground'
				)}
				title={issue.title}
			>
				{issue.title}
			</div>

			{#if issue.blocked || labels.length > 0 || sizeText || issue.labelConflict}
				<div class="flex flex-wrap items-center gap-1">
					{#if issue.blocked}
						<span
							class="text-destructive inline-flex items-center gap-0.5 text-[0.7rem] font-medium"
							title="Blocked"
						>
							<BanIcon class="size-3" aria-hidden="true" /> Blocked
						</span>
					{/if}
					{#if issue.labelConflict}
						<TriangleAlertIcon
							class="text-warning size-3.5"
							title="Conflicting reserved labels on GitHub"
						/>
					{/if}
					{#each labels as label (label)}
						<Chip label={label} />
					{/each}
					{#if sizeText}
						<span class="mono text-muted-foreground/70 text-[0.7rem]" title={`Size: ${issue.size}`}>
							{sizeText}
						</span>
					{/if}
				</div>
			{/if}
		</Item.Content>

		<Item.Actions class="shrink-0 flex-col items-end gap-1">
			<div
				class="flex items-center gap-0.5"
				role="presentation"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
			>
				<PriorityIcon priority={issue.priority} />
				<DropdownMenu.Root bind:open={menuOpen}>
					<DropdownMenu.Trigger
						class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 inline-flex size-5 items-center justify-center rounded outline-none transition-opacity focus-visible:ring-1 group-hover/card:opacity-100 data-[state=open]:opacity-100 max-md:opacity-100 md:opacity-0"
					>
						<EllipsisIcon class="size-3.5" />
						<span class="sr-only">Issue actions</span>
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="start" class="w-52">
						<DropdownMenu.Label>Move to</DropdownMenu.Label>
						<DropdownMenu.RadioGroup
							value={stage}
							onValueChange={(value) => void moveToStatus(issue, value)}
						>
							{#each stageOptions as option (option.value)}
								<DropdownMenu.RadioItem value={option.value} class="gap-2">
									<span
										class="size-2 shrink-0 rounded-full"
										style={option.color ? `background:${option.color}` : undefined}
									></span>
									<span class="flex-1 truncate">{option.label}</span>
								</DropdownMenu.RadioItem>
							{/each}
						</DropdownMenu.RadioGroup>

						<DropdownMenu.Separator />
						<DropdownMenu.Item
							class="gap-2"
							onSelect={() => (issue.blocked ? requestUnblock(issue) : requestBlock(issue))}
						>
							<BanIcon class="text-destructive size-3.5" />
							{issue.blocked ? 'Unblock…' : 'Block…'}
						</DropdownMenu.Item>
						<DropdownMenu.Item
							class="gap-2"
							onSelect={() => (closed ? requestReopen(issue) : requestClose(issue))}
						>
							{closed ? 'Reopen issue' : 'Close issue'}
						</DropdownMenu.Item>

						<DropdownMenu.Separator />
						<DropdownMenu.Item class="gap-2" onSelect={open}>
							<ExternalLinkIcon class="size-3.5" />
							Open details
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>

			{#if issue.assignees.length > 0}
				<div class="flex items-center gap-0.5">
					{#each issue.assignees.slice(0, 3) as person (person.githubId)}
						<Avatar login={person.login} avatarUrl={person.avatarUrl} size={16} />
					{/each}
				</div>
			{/if}
		</Item.Actions>
	</div>
</Item.Root>
