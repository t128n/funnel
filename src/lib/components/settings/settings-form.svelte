<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount, tick, untrack, type Snippet } from 'svelte';
	import { Button } from '@sveltestrap/sveltestrap';
	import {
		describeSettingsIssues,
		SETTINGS_FAILURE_SUMMARY,
		settingsSummaryMessage,
		type SettingsFormResult
	} from '#lib/settings-feedback';
	import { isDirty, settingsDirty } from './settings-dirty';

	/**
	 * One instance-settings form: ruled sections supplied as a snippet, one save
	 * action at the end, and a single summary for validation failures. The page
	 * still posts one hidden JSON `payload`; nothing about the server contract
	 * changed beyond carrying the dotted key alongside each issue.
	 */
	interface Props {
		/** The page's action result, for inline validation errors. */
		form: SettingsFormResult | null;
		/** Serialized settings patch submitted as the hidden `payload` field. */
		payload: string;
		children: Snippet;
		saveLabel?: string;
	}

	let { form, payload, children, saveLabel = 'Save Changes' }: Props = $props();

	let saving = $state(false);
	let saved = $state(false);
	let baseline = $state(untrack(() => payload));
	let summaryEl = $state<HTMLDivElement | null>(null);
	let markedFields: HTMLElement[] = [];

	const errorIdPrefix = $props.id();
	const dirty = $derived(isDirty(baseline, payload));
	const issues = $derived(describeSettingsIssues(form?.issues ?? [], errorIdPrefix));
	const summary = $derived(
		issues.length === 0 ? settingsSummaryMessage(form?.message) : null
	);
	const hasFeedback = $derived(Boolean(summary || issues.length));

	/** Any edit clears the previous confirmation; dirty state is payload-based. */
	function onEdit(): void {
		saved = false;
	}

	function clearFieldErrors(): void {
		for (const field of markedFields) {
			field.classList.remove('is-invalid');
			field.removeAttribute('aria-invalid');

			const describedBy = field.getAttribute('aria-describedby');
			if (!describedBy) continue;
			const remaining = describedBy
				.split(/\s+/)
				.filter((id) => !id.startsWith(`${errorIdPrefix}-`));
			if (remaining.length > 0) field.setAttribute('aria-describedby', remaining.join(' '));
			else field.removeAttribute('aria-describedby');
		}
		markedFields = [];
	}

	/** Mark every field the issue map could identify; the summary keeps the text. */
	function markFields(): void {
		clearFieldErrors();
		const marked = new Set<string>();

		for (const issue of issues) {
			if (!issue.selector || marked.has(issue.selector)) continue;
			const field = document.querySelector<HTMLElement>(issue.selector);
			if (!field) continue;

			marked.add(issue.selector);
			field.classList.add('is-invalid');
			field.setAttribute('aria-invalid', 'true');

			const describedBy = field.getAttribute('aria-describedby');
			field.setAttribute(
				'aria-describedby',
				describedBy ? `${describedBy} ${issue.id}` : issue.id
			);
			markedFields.push(field);
		}
	}

	/** Bring the one summary into view and focus it after a failed save. */
	async function revealErrors(): Promise<void> {
		await tick();
		markFields();
		if (!summaryEl) return;
		summaryEl.scrollIntoView({ block: 'center' });
		summaryEl.focus({ preventScroll: true });
	}

	$effect(() => {
		settingsDirty.set(dirty);
	});

	$effect(() => () => settingsDirty.set(false));

	onMount(() => {
		if (hasFeedback) void revealErrors();
	});
</script>

<div class="d-flex flex-column gap-4">
	{#if hasFeedback}
		<div class="alert alert-danger mb-0" role="alert" tabindex="-1" bind:this={summaryEl}>
			<p class="fw-semibold mb-1">{SETTINGS_FAILURE_SUMMARY}</p>
			{#if summary}
				<p class="mb-1">{summary}</p>
			{/if}
			{#if issues.length}
				<ul class="mb-0 ps-4">
					{#each issues as issue (issue.id)}
						<li id={issue.id}>{issue.text}</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}

	<form
		method="POST"
		action="?/save"
		data-settings-dirty={dirty}
		oninput={onEdit}
		onchange={onEdit}
		use:enhance={() => {
			saving = true;
			saved = false;
			return async ({ result, update }) => {
				try {
					// Keep the edited values in place: `update()` resets the form by
					// default, which blanks client-rendered inputs (no `value`
					// attribute to fall back to) and desyncs them from the state.
					await update({ reset: false });
					if (result.type === 'success') {
						saved = true;
						baseline = payload;
						clearFieldErrors();
					} else if (result.type === 'failure') {
						await revealErrors();
					}
				} finally {
					saving = false;
				}
			};
		}}
	>
		<input type="hidden" name="payload" value={payload} />

		<div class="d-flex flex-column gap-4">
			{@render children()}
		</div>

		<footer class="mt-4 d-flex flex-wrap align-items-center gap-3 border-top pt-3">
			<Button type="submit" color="primary" disabled={saving} style="min-width: 6rem">
				{saving ? 'Saving…' : saveLabel}
			</Button>
			<span style="min-height: 1.5rem" aria-live="polite">
				{#if saved}
					<span class="d-inline-flex align-items-center gap-1 text-success">
						<i class="bi bi-check-circle" aria-hidden="true"></i>
						Saved.
					</span>
				{:else if dirty}
					<span class="d-inline-flex align-items-center gap-1 text-body-secondary">
						<i class="bi bi-pencil-square" aria-hidden="true"></i>
						Unsaved changes
					</span>
				{/if}
			</span>
		</footer>
	</form>
</div>
