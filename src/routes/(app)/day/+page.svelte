<script lang="ts">
	import { Button } from '@sveltestrap/sveltestrap';
	import PageHead from '#lib/components/common/PageHead.svelte';
	import PageHeader from '#lib/components/shell/PageHeader.svelte';
	import DayPlan from '#lib/components/plan/DayPlan.svelte';
	import type { DayView } from './+page.server';

	interface DayData {
		dayView: DayView;
		previous: string;
		next: string;
		today: string;
		user?: unknown;
	}

	let { data }: { data: DayData } = $props();

	const date = $derived(data.dayView.date);
	const isToday = $derived(date === data.today);
	const mayPlanDay = $derived(data.user != null);
</script>

<PageHead
	title={`${data.dayView.label} · My day`}
	description="Time-block the issues committed to this week and compare planned against actual time."
/>

<main class="container-fluid px-3 px-lg-4 py-4">
	<PageHeader title={data.dayView.label}>
		{#snippet actions()}
			<Button color="link" size="sm" href="/settings/availability" class="text-decoration-none">
				Working hours
			</Button>
		{/snippet}
	</PageHeader>

	<nav
		class="d-flex flex-wrap align-items-center gap-1 border-bottom pb-2 mb-3"
		aria-label="Day navigation"
	>
		<Button
			color="link"
			size="sm"
			href={`/day?day=${data.previous}`}
			class="text-body-secondary text-decoration-none px-1"
			aria-label="Previous day"
			title="Previous day"
		>
			<i class="bi bi-chevron-left" aria-hidden="true"></i>
		</Button>

		{#if !isToday}
			<a class="link-primary px-2 small" href="/day">Today</a>
		{/if}

		<Button
			color="link"
			size="sm"
			href={`/day?day=${data.next}`}
			class="text-body-secondary text-decoration-none px-1"
			aria-label="Next day"
			title="Next day"
		>
			<i class="bi bi-chevron-right" aria-hidden="true"></i>
		</Button>

		<span class="ms-auto small text-body-secondary">
			Candidates come from the issues committed to this week.
			<a class="link-primary" href={`/plan`}>Open the week</a>
		</span>
	</nav>

	<DayPlan view={data.dayView} mayWrite={mayPlanDay} />
</main>
