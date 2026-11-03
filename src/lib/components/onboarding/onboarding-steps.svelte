<script lang="ts">
	interface Props {
		/** 1-based index of the current step. */
		active: number;
	}

	let { active }: Props = $props();

	const steps = ['Create app', 'Install', 'Ready'];
</script>

<nav aria-label="Setup progress">
	<ol class="list-unstyled d-flex flex-wrap align-items-center gap-2 small text-body-secondary mb-0">
		{#each steps as label, index (label)}
			{@const step = index + 1}
			{@const done = step < active}
			{@const current = step === active}
			<li
				class="d-flex align-items-center gap-1"
				class:fw-semibold={current}
				class:text-body={current || done}
				aria-current={current ? 'step' : undefined}
			>
				{#if done}
					<i class="bi bi-check-lg flex-shrink-0 text-success" aria-hidden="true"></i>
				{:else}
					<span class="font-monospace" aria-hidden="true">{step}</span>
				{/if}
				<span>{label}</span>
			</li>
			{#if step < steps.length}
				<li aria-hidden="true">
					<span class="d-block border-top" style="width: 1rem"></span>
				</li>
			{/if}
		{/each}
	</ol>
</nav>
