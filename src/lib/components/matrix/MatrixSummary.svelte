<script lang="ts">
	/**
	 * The two assessment counts above the workspace. They are live values from
	 * the same scoped dataset as the matrix, so a rating change updates both.
	 * The queue action is only rendered for writers with work waiting.
	 */
	interface Props {
		needsAssessment: number;
		rated: number;
		/** Opens the assessment queue; omitted for read-only viewers. */
		onreview?: (() => void) | null;
	}

	let { needsAssessment, rated, onreview = null }: Props = $props();
</script>

<section class="summary row g-0 border-top border-bottom py-3" aria-label="Assessment summary">
	<div class="summary-cell col-sm-6 d-flex flex-column gap-1 pe-sm-4">
		<h2 class="small fw-semibold mb-0">Needs assessment</h2>
		<p class="fs-5 fw-semibold mb-0 tnum">{needsAssessment}</p>
		<p class="small text-body-secondary mb-0">Issues awaiting classification</p>
		{#if onreview && needsAssessment > 0}
			<button
				type="button"
				class="btn btn-link btn-sm d-inline-flex align-items-center gap-1 align-self-start p-0 mt-1 text-decoration-none"
				aria-haspopup="dialog"
				onclick={onreview}
			>
				Review queue
				<i class="bi bi-arrow-right" aria-hidden="true"></i>
			</button>
		{/if}
	</div>

	<div class="summary-cell summary-cell--second col-sm-6 d-flex flex-column gap-1 py-3 py-sm-0 ps-sm-4">
		<h2 class="small fw-semibold mb-0">Rated issues</h2>
		<p class="fs-5 fw-semibold mb-0 tnum">{rated}</p>
		<p class="small text-body-secondary mb-0">Issues classified in the matrix</p>
	</div>
</section>

<style>
	.summary-cell--second {
		border-top: 1px solid var(--bs-border-color);
	}

	.tnum {
		font-variant-numeric: tabular-nums;
	}

	@media (min-width: 576px) {
		.summary-cell--second {
			border-top: 0;
			border-left: 1px solid var(--bs-border-color);
		}
	}
</style>
