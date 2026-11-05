<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		Button,
		Dropdown,
		DropdownItem,
		DropdownMenu,
		DropdownToggle,
		Input,
		Modal,
		ModalBody,
		ModalFooter,
		ModalHeader
	} from '@sveltestrap/sveltestrap';
	import ConfirmDialog from '#lib/components/settings/confirm-dialog.svelte';
	import { getGroupBy, setGroupBy } from '#lib/client/list-prefs.svelte';
	import {
		createSavedView as createSavedViewRequest,
		deleteSavedView as deleteSavedViewRequest,
		updateSavedView as updateSavedViewRequest
	} from '#lib/client/mutations';
	import {
		MAX_SAVED_VIEW_NAME,
		savedViewQuery,
		savedViewUrl,
		type SavedView,
		type SavedViewScope
	} from '#lib/saved-views';
	import { parseFilterParams } from '#lib/url-filter';

	/**
	 * Compact saved-view switcher for the Issues and Inbox toolbars.
	 *
	 * A view is a named URL preset: choosing one navigates to its stored path +
	 * query and applies its grouping, but the live URL stays authoritative. The
	 * menu therefore never edits filters itself; "Save current view" snapshots
	 * whatever the URL currently holds, and later filter edits are not auto-saved.
	 */
	interface Props {
		/** Views visible to the signed-in user (own + shared). */
		views: SavedView[];
		/** Which page's views this switcher shows and saves. */
		scope: SavedViewScope;
		/** `auth_user.id`, used to tell own views from shared ones. */
		userId: string;
		/** Whether the viewer holds `write`; read-only viewers get no write actions. */
		mayWrite: boolean;
		/** Whether the viewer is an admin (may manage any shared view). */
		mayAdmin?: boolean;
	}

	let { views, scope, userId, mayWrite, mayAdmin = false }: Props = $props();

	let menuOpen = $state(false);
	let formOpen = $state(false);
	let editing = $state<SavedView | null>(null);
	let name = $state('');
	let shared = $state(false);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let deleteOpen = $state(false);
	let deleteTarget = $state<SavedView | null>(null);

	const scopeViews = $derived(views.filter((view) => view.scope === scope));
	const manageable = $derived(
		scopeViews.filter(
			(view) => view.ownerUserId === userId || (view.shared && mayAdmin)
		)
	);
	const pinned = $derived(scopeViews.filter((view) => view.pinned));
	const unpinned = $derived(scopeViews.filter((view) => !view.pinned));

	function groupLabel(group: SavedView['group']): string {
		if (!group || group === 'none') return 'No grouping';
		return group.charAt(0).toUpperCase() + group.slice(1);
	}

	/** Navigate to the preset; grouping is local state, not part of the URL. */
	function openView(view: SavedView): void {
		menuOpen = false;
		if (view.group) setGroupBy(view.group);
		void goto(savedViewUrl(view), { reset: false });
	}

	function openCreate(): void {
		editing = null;
		name = '';
		shared = false;
		error = null;
		formOpen = true;
	}

	function openRename(view: SavedView): void {
		editing = view;
		name = view.name;
		shared = view.shared;
		error = null;
		menuOpen = false;
		formOpen = true;
	}

	function closeForm(): void {
		if (busy) return;
		formOpen = false;
		error = null;
	}

	const canSubmit = $derived(
		!busy && name.trim().length > 0 && name.trim().length <= MAX_SAVED_VIEW_NAME
	);

	async function submit(): Promise<void> {
		if (!canSubmit) return;
		if (!editing) {
			busy = true;
			error = null;
			const result = await createSavedViewRequest({
				name: name.trim(),
				...currentSnapshot(),
				shared
			});
			busy = false;
			if (!result.ok) {
				error = result.error;
				return;
			}
		} else {
			busy = true;
			error = null;
			const result = await updateSavedViewRequest(editing.id, {
				name: name.trim(),
				shared
			});
			busy = false;
			if (!result.ok) {
				error = result.error;
				return;
			}
		}
		formOpen = false;
		await invalidateAll();
	}

	/** The live URL/sort/group, ready to create or refresh a preset. */
	function currentSnapshot() {
		const filter = parseFilterParams(page.url.searchParams);
		return {
			query: savedViewQuery(filter, {
				snoozed:
					scope === 'inbox' && page.url.searchParams.get('snoozed') === '1'
			}),
			scope,
			sort: filter.sort,
			direction: filter.direction,
			group: getGroupBy()
		};
	}

	/** Replace a view's stored filters with the current ones, keeping its name. */
	async function updateCurrent(view: SavedView): Promise<void> {
		const result = await updateSavedViewRequest(view.id, currentSnapshot());
		if (result.ok) await invalidateAll();
	}

	async function togglePin(view: SavedView): Promise<void> {
		const result = await updateSavedViewRequest(view.id, {
			pinned: !view.pinned
		});
		if (result.ok) await invalidateAll();
	}

	function confirmDelete(view: SavedView): void {
		deleteTarget = view;
		deleteOpen = true;
		menuOpen = false;
	}

	async function remove(): Promise<void> {
		const target = deleteTarget;
		deleteTarget = null;
		if (!target) return;
		const result = await deleteSavedViewRequest(target.id);
		if (result.ok) await invalidateAll();
	}
</script>

<Dropdown bind:isOpen={menuOpen}>
	<DropdownToggle
		color="outline-secondary"
		size="sm"
		class="d-inline-flex align-items-center gap-2"
		aria-label={`Saved views (${scopeViews.length})`}
	>
		<i class="bi bi-bookmark-star" aria-hidden="true"></i>
		<span>Views</span>
		{#if scopeViews.length > 0}
			<span class="badge text-bg-secondary ms-1">{scopeViews.length}</span>
		{/if}
	</DropdownToggle>

	<DropdownMenu end style="min-width: 20rem">
		<li><h6 class="dropdown-header">Saved {scope === 'inbox' ? 'Inbox' : 'issue'} views</h6></li>

		{#if scopeViews.length === 0}
			<li>
				<span class="dropdown-item-text small text-body-secondary">
					No saved views yet. Save the current filters as a reusable preset.
				</span>
			</li>
		{:else}
			{#if pinned.length > 0}
				<li><h6 class="dropdown-header">Pinned</h6></li>
				{#each pinned as view (view.id)}
					<li>
						<button
							type="button"
							class="dropdown-item d-flex align-items-start gap-2"
							onclick={() => openView(view)}
						>
							<i class="bi bi-pin-angle-fill mt-1" aria-hidden="true"></i>
							<span class="min-w-0 flex-grow-1">
								<span class="d-block text-truncate">{view.name}</span>
								<span class="d-block small text-body-secondary">
									{view.shared ? 'Shared' : 'Personal'} · {groupLabel(view.group)}
								</span>
							</span>
						</button>
					</li>
				{/each}
			{/if}

			{#if unpinned.length > 0}
				{#if pinned.length > 0}
					<li><h6 class="dropdown-header">All views</h6></li>
				{/if}
				{#each unpinned as view (view.id)}
					<li>
						<button
							type="button"
							class="dropdown-item d-flex align-items-start gap-2"
							onclick={() => openView(view)}
						>
							<i class="bi bi-bookmark mt-1" aria-hidden="true"></i>
							<span class="min-w-0 flex-grow-1">
								<span class="d-block text-truncate">{view.name}</span>
								<span class="d-block small text-body-secondary">
									{view.shared ? 'Shared' : 'Personal'} · {groupLabel(view.group)}
								</span>
							</span>
						</button>
					</li>
				{/each}
			{/if}
		{/if}

		{#if mayWrite}
			<li><hr class="dropdown-divider" /></li>
			<DropdownItem on:click={openCreate}>
				<i class="bi bi-plus-lg me-2" aria-hidden="true"></i>
				Save current view…
			</DropdownItem>
		{/if}

		{#if mayWrite && manageable.length > 0}
			<li><hr class="dropdown-divider" /></li>
			<li><h6 class="dropdown-header">Manage</h6></li>
			{#each manageable as view (view.id)}
				<li class="px-3 py-1 d-flex align-items-center gap-1">
					<span class="small text-truncate flex-grow-1" title={view.name}>{view.name}</span>
					<Button
						color="link"
						size="sm"
						class="p-1 text-decoration-none"
						aria-label={`${view.pinned ? 'Unpin' : 'Pin'} ${view.name}`}
						title={view.pinned ? 'Unpin' : 'Pin'}
						onclick={() => void togglePin(view)}
					>
						<i class="bi {view.pinned ? 'bi-pin-angle-fill' : 'bi-pin-angle'}" aria-hidden="true"></i>
					</Button>
					<Button
						color="link"
						size="sm"
						class="p-1 text-decoration-none"
						aria-label={`Update ${view.name} with the current filters`}
						title="Update with current filters"
						onclick={() => void updateCurrent(view)}
					>
						<i class="bi bi-arrow-repeat" aria-hidden="true"></i>
					</Button>
					<Button
						color="link"
						size="sm"
						class="p-1 text-decoration-none"
						aria-label={`Rename ${view.name}`}
						title="Rename or change sharing"
						onclick={() => openRename(view)}
					>
						<i class="bi bi-pencil" aria-hidden="true"></i>
					</Button>
					<Button
						color="link"
						size="sm"
						class="p-1 text-decoration-none text-danger"
						aria-label={`Delete ${view.name}`}
						title="Delete"
						onclick={() => confirmDelete(view)}
					>
						<i class="bi bi-trash" aria-hidden="true"></i>
					</Button>
				</li>
			{/each}
		{/if}

		{#if mayWrite && scopeViews.length > 0 && manageable.length === 0}
			<li>
				<span class="dropdown-item-text small text-body-secondary">
					Shared views can only be changed by their owner or an admin.
				</span>
			</li>
		{/if}
	</DropdownMenu>
</Dropdown>

<Modal isOpen={formOpen} toggle={closeForm} labelledBy="saved-view-form-title">
	<ModalHeader toggle={closeForm} id="saved-view-form-title">
		{editing ? 'Rename saved view' : 'Save current view'}
	</ModalHeader>
	<form onsubmit={(event) => { event.preventDefault(); void submit(); }}>
		<ModalBody>
			<p class="small text-body-secondary">
				{#if editing}
					Changing the name or sharing does not alter the saved filters.
				{:else}
					The current filters, sort and grouping become a reusable preset. Later filter
					changes stay in the URL and are not saved unless you save a new view.
				{/if}
			</p>
			<label class="form-label" for="saved-view-name">Name</label>
			<Input
				id="saved-view-name"
				value={name}
				maxlength={MAX_SAVED_VIEW_NAME}
				placeholder="e.g. P1 unblocked in core"
				on:input={(event) => (name = event.currentTarget.value)}
				required
			/>
			<div class="form-check mt-3">
				<input
					class="form-check-input"
					type="checkbox"
					id="saved-view-shared"
					bind:checked={shared}
				/>
				<label class="form-check-label" for="saved-view-shared">
					Share with everyone on this instance
				</label>
				<div class="form-text">Shared views are read-only for other people.</div>
			</div>
			{#if error}
				<div class="alert alert-danger py-2 small mt-3 mb-0" role="alert">{error}</div>
			{/if}
		</ModalBody>
		<ModalFooter>
			<Button color="secondary" outline onclick={closeForm} disabled={busy}>Cancel</Button>
			<Button color="primary" type="submit" disabled={!canSubmit}>
				{busy ? 'Saving…' : editing ? 'Save changes' : 'Save view'}
			</Button>
		</ModalFooter>
	</form>
</Modal>

<ConfirmDialog
	bind:open={deleteOpen}
	title="Delete saved view"
	description={`Delete “${deleteTarget?.name ?? ''}”? The issues and filters themselves are not affected.`}
	confirmLabel="Delete view"
	onconfirm={() => void remove()}
/>
