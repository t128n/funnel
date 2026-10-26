<script lang="ts">
	import Avatar from '#lib/components/common/Avatar.svelte';
	import { Button } from '#lib/components/primitives/button';
	import { attachmentUrl } from '#lib/client/mutations';
	import { timeAgo } from '#lib/client/clock.svelte';
	import { absoluteTime } from '#lib/time';
	import type { AttachmentItem } from '#lib/server/issues/types';
	import { cn } from '#lib/utils';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import FileIcon from '@lucide/svelte/icons/file';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import UploadIcon from '@lucide/svelte/icons/upload';

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

<section class="flex flex-col gap-3" aria-label="Attachments">
	<div class="flex items-center justify-between">
		<h2 class="text-foreground text-base font-semibold">Files</h2>
		<span class="mono text-muted-foreground text-xs">{attachments.length}</span>
	</div>

	{#if !readonly}
		<div
			class={cn(
				'border-border hover:border-border/80 rounded-lg border border-dashed px-4 py-5 text-center transition-colors',
				dragging && 'border-ring bg-accent/40'
			)}
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
				class="hidden"
				onchange={onPick}
				aria-hidden="true"
				tabindex={-1}
			/>
			<button
				type="button"
				class="text-muted-foreground hover:text-foreground flex w-full cursor-pointer flex-col items-center gap-1.5 text-xs"
				disabled={uploading > 0}
				onclick={() => input?.click()}
			>
				<UploadIcon class="size-4" />
				<span>
					{#if uploading > 0}
						Uploading {uploading} file{uploading === 1 ? '' : 's'}…
					{:else}
						Drop files here, or <span class="text-foreground font-medium">browse</span>
					{/if}
				</span>
			</button>
		</div>
	{/if}

	{#if attachments.length > 0}
		<ul class="flex flex-col">
			{#each attachments as item (item.id)}
				<li class="border-border flex items-center gap-2.5 border-t py-2 text-sm first:border-t-0">
					<FileIcon class="text-muted-foreground size-4 shrink-0" />
					<div class="flex min-w-0 flex-1 flex-col">
						<span class="truncate font-medium" title={item.filename}>{item.filename}</span>
						<span class="text-muted-foreground flex items-center gap-1.5 text-[11px]">
							<span class="mono">{formatBytes(item.sizeBytes)}</span>
							{#if item.uploadedBy}
								<span class="inline-flex items-center gap-1">
									<Avatar
										login={item.uploadedBy.login}
										avatarUrl={item.uploadedBy.avatarUrl}
										size={12}
									/>
									{item.uploadedBy.login}
								</span>
							{/if}
							<span title={absoluteTime(item.createdAt)}>{timeAgo(item.createdAt)}</span>
						</span>
					</div>
					<Button
						variant="ghost"
						size="icon-xs"
						href={attachmentUrl(item.id)}
						title="Download"
						aria-label="Download {item.filename}"
					>
						<DownloadIcon />
					</Button>
					{#if !readonly}
						<Button
							variant="ghost"
							size="icon-xs"
							title="Delete"
							aria-label="Delete {item.filename}"
							disabled={busyId === item.id}
							onclick={() => ondelete(item)}
						>
							<TrashIcon />
						</Button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>
