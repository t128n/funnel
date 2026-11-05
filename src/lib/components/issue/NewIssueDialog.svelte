<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { untrack } from 'svelte';
	import {
		Button,
		FormGroup,
		Input,
		Label,
		Modal,
		ModalBody,
		ModalFooter,
		ModalHeader
	} from '@sveltestrap/sveltestrap';
	import InlineStatus from '#lib/components/common/InlineStatus.svelte';
	import MultiSelect from '#lib/components/common/MultiSelect.svelte';
	import Spinner from '#lib/components/common/Spinner.svelte';
	import { createIssue } from '#lib/client/mutations';
	import {
		closeQuickCreate,
		quickCreate,
		reportQuickCreateSuccess
	} from '#lib/client/quick-create';
	import { SIZE_OPTIONS, STATUS_OPTIONS } from '#lib/labels';
	import {
		IMPACT_SCALE,
		URGENCY_SCALE,
		derivePriorityOrNull,
		impactLabel,
		parseImpactLabel,
		parseUrgencyLabel,
		priorityMeta,
		urgencyLabel
	} from '#lib/priority';

	/**
	 * In-app quick create (issue #18). This is deliberately separate from the
	 * public `/intake` flow: a signed-in writer creates the GitHub issue
	 * immediately with the fields the API already accepts, then the app
	 * refreshes its feeds and shows a confirmation with the GitHub link.
	 */
	interface Props {
		/** Configured repository slugs (`owner/name`). */
		repos: string[];
		/** Instance default when the trigger has no repo context. */
		defaultRepo: string;
		/** Assignable/known GitHub users. */
		assignees: Array<{ login: string }>;
		/** Non-reserved labels only; reserved groups have their own fields. */
		labelOptions: string[];
	}

	let { repos, defaultRepo, assignees, labelOptions }: Props = $props();

	const TITLE_MAX = 256;
	const BODY_MAX = 65536;

	let repo = $state('');
	let title = $state('');
	let body = $state('');
	let status = $state('');
	let impact = $state('');
	let urgency = $state('');
	let size = $state('');
	let selectedAssignees = $state<string[]>([]);
	let selectedLabels = $state<string[]>([]);
	let busy = $state(false);
	let error = $state<string | null>(null);

	const open = $derived($quickCreate.open);

	const repoChoices = $derived.by(() => {
		const list = [...new Set(repos.filter((value) => value.trim().length > 0))];
		if (defaultRepo && !list.includes(defaultRepo)) list.unshift(defaultRepo);
		return list;
	});

	const statusOptions = [
		{ value: '', label: 'No status (untriaged)' },
		...STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))
	];
	const sizeOptions = [
		{ value: '', label: 'Unestimated' },
		...SIZE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))
	];
	const impactOptions = IMPACT_SCALE.flatMap((level) => {
		const value = impactLabel(level.value);
		return value === null ? [] : [{ value, label: level.name }];
	});
	const urgencyOptions = URGENCY_SCALE.flatMap((level) => {
		const value = urgencyLabel(level.value);
		return value === null ? [] : [{ value, label: level.name }];
	});

	const assigneeOptions = $derived(
		assignees.map((person) => ({ value: person.login, label: person.login }))
	);
	const labelChoices = $derived(
		labelOptions.map((name) => ({ value: name, label: name }))
	);

	const preview = $derived(
		impact && urgency
			? derivePriorityOrNull(parseImpactLabel(impact), parseUrgencyLabel(urgency))
			: null
	);
	const previewMeta = $derived(priorityMeta(preview));

	const canSubmit = $derived(
		!busy &&
			repo.trim().length > 0 &&
			title.trim().length > 0 &&
			title.trim().length <= TITLE_MAX
	);

	/** Pick the prefill when it is configured, otherwise the instance default. */
	function resolveRepo(prefillRepo?: string): string {
		if (prefillRepo && repoChoices.includes(prefillRepo)) return prefillRepo;
		if (defaultRepo && repoChoices.includes(defaultRepo)) return defaultRepo;
		return repoChoices[0] ?? '';
	}

	// A fresh open resets the form to the prefill, so a cancelled draft never
	// leaks into the next create. Only the open flag is tracked: a layout
	// refresh after a create must not reset the draft mid-flight.
	$effect(() => {
		if (!$quickCreate.open) return;
		untrack(() => {
			const prefill = $quickCreate.prefill;
			repo = resolveRepo(prefill.repo);
			status = prefill.status ?? '';
			title = '';
			body = '';
			impact = '';
			urgency = '';
			size = '';
			selectedAssignees = [];
			selectedLabels = [];
			busy = false;
			error = null;
		});
	});

	function close() {
		if (!busy) closeQuickCreate();
	}

	async function submit() {
		if (!canSubmit) return;
		busy = true;
		error = null;
		const result = await createIssue(repo, {
			title: title.trim(),
			...(body.length > 0 ? { body } : {}),
			...(status ? { status } : {}),
			...(impact ? { impact } : {}),
			...(urgency ? { urgency } : {}),
			...(size ? { size } : {}),
			assignees: selectedAssignees,
			labels: selectedLabels
		});
		if (!result.ok) {
			error = result.error;
			busy = false;
			return;
		}
		try {
			await invalidateAll();
		} catch {
			// The issue was created even if the route data could not be refreshed;
			// the mirror's own refresh still catches up. Keep the confirmation.
		}
		reportQuickCreateSuccess({
			repo,
			number: result.value.number,
			htmlUrl: result.value.htmlUrl
		});
	}
</script>

<Modal isOpen={open} toggle={close} labelledBy="new-issue-title" size="lg">
	<form
		onsubmit={(event) => {
			event.preventDefault();
			void submit();
		}}
	>
		<ModalHeader toggle={close} id="new-issue-title">New issue</ModalHeader>

		<ModalBody>
			<p class="small text-body-secondary">
				Creates the issue on GitHub immediately. To stage a public submission for triage
				instead, use the external intake form.
			</p>

			{#if repoChoices.length === 0}
				<InlineStatus
					tone="warning"
					message="No repositories are configured. Add one in Settings → Repositories first."
					class="mb-3"
				/>
			{/if}

			<div class="d-flex flex-column gap-3">
				<FormGroup class="mb-0">
					<Label for="new-issue-repo">Repository</Label>
					<select
						id="new-issue-repo"
						class="form-select"
						bind:value={repo}
						disabled={busy || repoChoices.length === 0}
					>
						{#each repoChoices as choice (choice)}
							<option value={choice}>{choice}</option>
						{/each}
					</select>
				</FormGroup>

				<FormGroup class="mb-0">
					<Label for="new-issue-field-title">
						Title <span class="fw-normal text-danger">required</span>
					</Label>
					<Input
						id="new-issue-field-title"
						bind:value={title}
						maxlength={TITLE_MAX}
						required
						autocomplete="off"
						placeholder="A short, specific summary"
						disabled={busy}
					/>
				</FormGroup>

				<FormGroup class="mb-0">
					<Label for="new-issue-body">Description</Label>
					<textarea
						id="new-issue-body"
						class="form-control"
						rows="4"
						maxlength={BODY_MAX}
						bind:value={body}
						placeholder="Context, steps to reproduce, or acceptance criteria (Markdown)"
						disabled={busy}
					></textarea>
				</FormGroup>

				<div class="row g-3">
					<div class="col-sm-6">
						<FormGroup class="mb-0">
							<Label for="new-issue-status">Status</Label>
							<select
								id="new-issue-status"
								class="form-select"
								bind:value={status}
								disabled={busy}
							>
								{#each statusOptions as option (option.value)}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						</FormGroup>
					</div>
					<div class="col-sm-6">
						<FormGroup class="mb-0">
							<Label for="new-issue-size">Size</Label>
							<select id="new-issue-size" class="form-select" bind:value={size} disabled={busy}>
								{#each sizeOptions as option (option.value)}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						</FormGroup>
					</div>

					<div class="col-sm-6">
						<FormGroup class="mb-0">
							<Label for="new-issue-impact">Impact</Label>
							<select
								id="new-issue-impact"
								class="form-select"
								bind:value={impact}
								disabled={busy}
							>
								<option value="">Not assessed</option>
								{#each impactOptions as option (option.value)}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						</FormGroup>
					</div>
					<div class="col-sm-6">
						<FormGroup class="mb-0">
							<Label for="new-issue-urgency">Urgency</Label>
							<select
								id="new-issue-urgency"
								class="form-select"
								bind:value={urgency}
								disabled={busy}
							>
								<option value="">Not assessed</option>
								{#each urgencyOptions as option (option.value)}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						</FormGroup>
					</div>
				</div>

				{#if previewMeta}
					<p class="small text-body-secondary mb-0">
						Priority: <span class="fw-semibold">{previewMeta.value} · {previewMeta.name}</span>
					</p>
				{/if}

				<FormGroup class="mb-0">
					<Label for="new-issue-assignees">Assignees</Label>
					<MultiSelect
						id="new-issue-assignees"
						label="Assignees"
						options={assigneeOptions}
						selected={selectedAssignees}
						onselect={(values) => (selectedAssignees = values)}
						display="selection"
						placeholder="No assignees"
						size="md"
						fullWidth
						disabled={busy}
					/>
				</FormGroup>

				<FormGroup class="mb-0">
					<Label for="new-issue-labels">Labels</Label>
					<MultiSelect
						id="new-issue-labels"
						label="Labels"
						options={labelChoices}
						selected={selectedLabels}
						onselect={(values) => (selectedLabels = values)}
						display="selection"
						placeholder="No labels"
						size="md"
						fullWidth
						disabled={busy}
					/>
					<div class="form-text">
						Reserved status, impact, urgency, size and flag labels are set by their own
						fields.
					</div>
				</FormGroup>

				<p class="small text-body-secondary mb-0">
					Need the public submission flow? <a href="/intake">Open the intake form</a>.
				</p>

				{#if error}
					<InlineStatus tone="error" message={error} />
				{/if}
			</div>
		</ModalBody>

		<ModalFooter>
			<Button color="secondary" outline type="button" disabled={busy} onclick={close}>
				Cancel
			</Button>
			<Button type="submit" color="primary" disabled={!canSubmit}>
				{#if busy}
					<Spinner size={13} class="me-1" />
				{/if}
				{busy ? 'Creating…' : 'Create issue'}
			</Button>
		</ModalFooter>
	</form>
</Modal>
