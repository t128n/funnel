<script lang="ts">
	import {
		Alert,
		Button,
		FormGroup,
		Input,
		Label,
		Modal,
		ModalBody,
		ModalFooter,
		ModalHeader
	} from '@sveltestrap/sveltestrap';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import { createRepoMilestone } from '#lib/client/mutations';
	import type { RepoMilestoneRef } from '#lib/server/issues/types';

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

	let creating = $state(false);
	let title = $state('');
	let dueOn = $state('');
	let error = $state<string | null>(null);
	let busy = $state(false);
	let selectEl: HTMLSelectElement | undefined = $state();

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
		// Keep the selected milestone visible while a fresh detail payload that
		// includes a just-created option is still in flight.
		if (value) {
			const key = `${value.repo}#${value.number}`;
			if (!seen.has(key)) list.unshift(value);
		}
		return list;
	});

	const selectedKey = $derived(
		value ? `${value.repo}#${value.number}` : ''
	);

	function choose(milestone: RepoMilestoneRef) {
		onselect(milestone);
	}

	function clear() {
		onselect(null);
	}

	function startCreating() {
		creating = true;
		error = null;
		title = '';
		dueOn = '';
	}

	function cancelCreating() {
		if (busy) return;
		creating = false;
		error = null;
	}

	function onChange(event: Event) {
		const next = (event.currentTarget as HTMLSelectElement).value;
		if (next === '__new__') {
			// The select is a trigger, not a value: restore the current milestone
			// while the create dialog opens.
			if (selectEl) selectEl.value = selectedKey;
			startCreating();
			return;
		}
		if (next === '') {
			clear();
			return;
		}
		const milestone = ordered.find(
			(option) => `${option.repo}#${option.number}` === next
		);
		if (milestone) choose(milestone);
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
	}
</script>

<div class="input-group">
	<span class="input-group-text px-2" aria-hidden="true">
		<i class="bi bi-signpost-split"></i>
	</span>
	<select
		bind:this={selectEl}
		class="form-select"
		aria-label="Milestone"
		{disabled}
		value={selectedKey}
		onchange={onChange}
	>
		<option value="">No milestone</option>
		{#each ordered as milestone (`${milestone.repo}#${milestone.number}`)}
			<option value={`${milestone.repo}#${milestone.number}`}>
				{milestone.title}{milestone.state === 'closed' ? ' (closed)' : ''}
			</option>
		{/each}
		<option value="__new__">New milestone…</option>
	</select>
</div>

<Modal isOpen={creating} toggle={cancelCreating} labelledBy="new-milestone-title">
	<ModalHeader toggle={cancelCreating} id="new-milestone-title">New milestone</ModalHeader>
	<ModalBody>
		<p class="small text-body-secondary">
			Milestones are scoped to the repository. This one is created in {repo}.
		</p>
		<FormGroup class="mb-3">
			<Label for="milestone-title">Title <span class="fw-normal text-danger">required</span></Label>
			<Input
				id="milestone-title"
				bind:value={title}
				placeholder="Milestone title"
				autocomplete="off"
				spellcheck="false"
				onkeydown={(event) => {
					if (event.key === 'Enter') {
						event.preventDefault();
						void create();
					}
				}}
			/>
		</FormGroup>
		<FormGroup class="mb-0">
			<Label for="milestone-due">Due date</Label>
			<Input
				id="milestone-due"
				bind:value={dueOn}
				type="date"
				onkeydown={(event) => {
					if (event.key === 'Enter') {
						event.preventDefault();
						void create();
					}
				}}
			/>
		</FormGroup>
		{#if error}
			<Alert color="danger" class="small mt-3 mb-0 py-2">
				{error}
			</Alert>
		{/if}
	</ModalBody>
	<ModalFooter>
		<Button color="secondary" outline type="button" disabled={busy} onclick={cancelCreating}>
			Cancel
		</Button>
		<Button
			color="primary"
			onclick={() => void create()}
			disabled={busy || title.trim().length === 0}
		>
			{#if busy}<Spinner size={13} class="me-1" />{/if}
			Create
		</Button>
	</ModalFooter>
</Modal>
