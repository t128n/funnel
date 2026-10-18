<script lang="ts">
	import BellIcon from '@lucide/svelte/icons/bell';
	import FolderGit2Icon from '@lucide/svelte/icons/folder-git-2';
	import KeyboardIcon from '@lucide/svelte/icons/keyboard';
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import PaintbrushIcon from '@lucide/svelte/icons/paintbrush';
	import Settings2Icon from '@lucide/svelte/icons/settings-2';
	import * as Breadcrumb from '#lib/components/ui/breadcrumb';
	import * as Dialog from '#lib/components/ui/dialog';
	import { NativeSelect, NativeSelectOption } from '#lib/components/ui/native-select';
	import * as Sidebar from '#lib/components/ui/sidebar';
	import { closeSettings, isSettingsOpen, openSettings } from '#lib/client/settings.svelte';
	import type { CommentUi } from '#lib/comment-ui';
	import AppearanceSection from './appearance-section.svelte';
	import CommentsSection from './comments-section.svelte';
	import ComingSoon from './coming-soon.svelte';

	interface Props {
		/** Comment rendering the server resolved for this request. */
		commentUi: CommentUi;
	}

	let { commentUi }: Props = $props();

	type SectionId =
		| 'appearance'
		| 'comments'
		| 'notifications'
		| 'repositories'
		| 'accessibility'
		| 'advanced';

	const sections: {
		id: SectionId;
		label: string;
		// This should be `Component` after @lucide/svelte updates types
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		icon: any;
	}[] = [
		{ id: 'appearance', label: 'Appearance', icon: PaintbrushIcon },
		{ id: 'comments', label: 'Comments', icon: MessageSquareIcon },
		{ id: 'notifications', label: 'Notifications', icon: BellIcon },
		{ id: 'repositories', label: 'Repositories', icon: FolderGit2Icon },
		{ id: 'accessibility', label: 'Accessibility', icon: KeyboardIcon },
		{ id: 'advanced', label: 'Advanced', icon: Settings2Icon }
	];

	const open = $derived(isSettingsOpen());

	let active = $state<SectionId>('appearance');
	const activeSection = $derived(sections.find((section) => section.id === active) ?? sections[0]);

	// Reopening the dialog always lands on the first section.
	$effect(() => {
		if (open) active = sections[0].id;
	});
</script>

<Dialog.Root open={open} onOpenChange={(next) => (next ? openSettings() : closeSettings())}>
	<Dialog.Content
		class="max-h-[calc(100svh-2rem)] overflow-hidden p-0 sm:max-w-[700px] md:max-h-[500px] lg:max-w-[800px]"
	>
		<Dialog.Title class="sr-only">Settings</Dialog.Title>
		<Dialog.Description class="sr-only">Customize how Funnel looks and behaves.</Dialog.Description>
		<Sidebar.Provider class="items-start min-h-0" style="--sidebar-width: 14rem">
			<Sidebar.Root collapsible="none" class="hidden md:flex">
				<Sidebar.Content>
					<Sidebar.Group>
						<Sidebar.GroupLabel>Settings</Sidebar.GroupLabel>
						<Sidebar.GroupContent>
							<Sidebar.Menu>
								{#each sections as section (section.id)}
									<Sidebar.MenuItem>
										<Sidebar.MenuButton
											isActive={active === section.id}
											onclick={() => (active = section.id)}
										>
											<section.icon />
											<span>{section.label}</span>
										</Sidebar.MenuButton>
									</Sidebar.MenuItem>
								{/each}
							</Sidebar.Menu>
						</Sidebar.GroupContent>
					</Sidebar.Group>
				</Sidebar.Content>
			</Sidebar.Root>

			<main class="flex h-[480px] max-h-[calc(100svh-2rem)] min-w-0 flex-1 flex-col overflow-hidden">
				<header class="flex h-14 shrink-0 items-center gap-2 border-b px-4">
					<Breadcrumb.Root>
						<Breadcrumb.List>
							<Breadcrumb.Item class="hidden md:block">
								<span class="text-muted-foreground">Settings</span>
							</Breadcrumb.Item>
							<Breadcrumb.Separator class="hidden md:block" />
							<Breadcrumb.Item>
								<Breadcrumb.Page>{activeSection.label}</Breadcrumb.Page>
							</Breadcrumb.Item>
						</Breadcrumb.List>
					</Breadcrumb.Root>

					<!-- Below `md` the section nav is hidden, so offer a compact switcher. -->
					<NativeSelect
						class="ms-auto w-40 md:hidden"
						bind:value={active}
						aria-label="Settings section"
					>
						{#each sections as section (section.id)}
							<NativeSelectOption value={section.id}>{section.label}</NativeSelectOption>
						{/each}
					</NativeSelect>
				</header>

				<div class="flex-1 overflow-y-auto p-4">
					{#if active === 'appearance'}
						<AppearanceSection />
					{:else if active === 'comments'}
						<CommentsSection value={commentUi} />
					{:else}
						<ComingSoon label={activeSection.label} />
					{/if}
				</div>
			</main>
		</Sidebar.Provider>
	</Dialog.Content>
</Dialog.Root>
