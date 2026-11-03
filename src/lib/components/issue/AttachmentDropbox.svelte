<script lang="ts">
	import { Button } from '@sveltestrap/sveltestrap';
	import Avatar from '#lib/components/common/Avatar.svelte';
	import { attachmentUrl } from '#lib/client/mutations';
	import { timeAgo } from '#lib/client/clock.svelte';
	import { absoluteTime } from '#lib/time';
	import type { AttachmentItem } from '#lib/server/issues/types';

	/**
	 * The issue "dropbox": drag-and-drop (or pick) files to upload, list what is
	 * there, download and delete. Bytes are served by `/api/attachments/[id]`;
	 * this component only ever sees metadata. Upload/delete are delegated to the
	 * parent, which owns the mutations and reloads the Inspector payload.
	 */
	interface Props {
		attachments: AttachmentItem[];
		/** Number of uploads still in flight. */
		uploading?: number;
		/** Attachment id being deleted, for the row spinner. */
		busyId?: string | null;
		/** Hide the upload dropzone and delete buttons (RBAC `read`). */
		readonly?: boolean;
		onupload: (files: File[]) => void;
		ondelete: (item: AttachmentItem) => void;
	}

	let {
		attachments,
		uploading = 0,
		busyId = null,
		readonly = false,
		onupload,
		ondelete
	}: Props = $props();

	let dragging = $state(false);
	let input: HTMLInputElement | undefined = $state();

	function formatBytes(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		const units = ['KB', 'MB', 'GB', 'TB'];
		let value = bytes / 1024;
		let unit = 0;
		while (value >= 1024 && unit < units.length - 1) {
			value /= 1024;
			unit += 1;
		}
		return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		if (event.dataTransfer?.files) onupload(Array.from(event.dataTransfer.files));
	}

	function onPick(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		if (target.files) onupload(Array.from(target.files));
		target.value = '';
	}
</script>

<section class="d-flex flex-column gap-3" aria-label="Attachments">
	<div class="d-flex align-items-center justify-content-between gap-3 border-top pt-3">
		<h2 class="h5 fw-semibold mb-0">Attachments</h2>
		<span class="small text-body-secondary attachment-count">{attachments.length}</span>
	</div>

	{#if !readonly}
		<div
			class="attachment-dropzone rounded px-4 py-4 text-center {dragging
				? 'border-primary bg-body-secondary'
				: ''}"
			role="group"
			aria-label="Attachment drop zone"
			ondragover={(e) => {
				e.preventDefault();
				dragging = true;
			}}
			ondragleave={() => (dragging = false)}
			ondrop={onDrop}
		>
			<input
				bind:this={input}
				type="file"
				multiple
				class="d-none"
				onchange={onPick}
				aria-hidden="true"
				tabindex={-1}
			/>
			<Button
				color="link"
				class="d-flex w-100 flex-column align-items-center gap-2 text-decoration-none small text-body-secondary"
				disabled={uploading > 0}
				onclick={() => input?.click()}
			>
				<i class="bi bi-upload fs-5" aria-hidden="true"></i>
				<span>
					{#if uploading > 0}
						Uploading {uploading} file{uploading === 1 ? '' : 's'}…
					{:else}
						Drop files here, or <span class="fw-semibold text-body">browse</span>
					{/if}
				</span>
			</Button>
		</div>
	{/if}

	{#if attachments.length > 0}
		<ul class="list-unstyled mb-0">
			{#each attachments as item (item.id)}
				<li
					class="attachment-row d-flex align-items-center gap-2 border-top py-2"
				>
					<i class="bi bi-file-earmark flex-shrink-0 text-body-tertiary" aria-hidden="true"></i>
					<div class="d-flex min-w-0 flex-grow-1 flex-column gap-1">
						<span class="text-truncate fw-semibold" title={item.filename}>{item.filename}</span>
						<span class="d-flex flex-wrap align-items-center gap-2 small text-body-secondary">
							<span class="attachment-count">{formatBytes(item.sizeBytes)}</span>
							{#if item.uploadedBy}
								<span class="d-inline-flex align-items-center gap-1">
									<Avatar
										login={item.uploadedBy.login}
										avatarUrl={item.uploadedBy.avatarUrl}
										size={16}
									/>
									{item.uploadedBy.login}
								</span>
							{/if}
							<span title={absoluteTime(item.createdAt)}>{timeAgo(item.createdAt)}</span>
						</span>
					</div>
					<Button
						color="link"
						size="sm"
						class="text-decoration-none px-1"
						href={attachmentUrl(item.id)}
						title="Download"
						aria-label="Download {item.filename}"
					>
						<i class="bi bi-download" aria-hidden="true"></i>
					</Button>
					{#if !readonly}
						<Button
							color="link"
							size="sm"
							class="text-decoration-none px-1 text-body-secondary"
							title="Delete"
							aria-label="Delete {item.filename}"
							disabled={busyId === item.id}
							onclick={() => ondelete(item)}
						>
							<i class="bi bi-trash" aria-hidden="true"></i>
						</Button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.attachment-dropzone {
		border: 1px dashed var(--bs-border-color);
	}

	.attachment-row:first-child {
		border-top: 0 !important;
	}

	.attachment-count {
		font-variant-numeric: tabular-nums;
	}
</style>
