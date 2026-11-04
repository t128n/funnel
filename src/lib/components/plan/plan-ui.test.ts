/**
 * Planner page contracts.
 *
 * Bun cannot render Svelte components without the Vite plugin, so the render
 * contracts are checked by reading the markup the page must contain (the same
 * source-read style as `tests/planning-page.test.ts`).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { scheduleErrorMessage } from "./schedule";

function source(relative: string): string {
	return readFileSync(new URL(relative, import.meta.url), "utf8");
}

const page = source("../../../routes/(app)/plan/+page.svelte");

describe("plan page composition", () => {
	test("test_page_heading_is_plan_and_the_week", () => {
		expect(page).toContain("<PageHeader");
		expect(page).toContain("Plan — ${weekHeadline(week)}");
		expect(page).toContain("Previous week");
		expect(page).toContain("Next week");
		expect(page).toContain("This week");
		expect(page).toContain('color="outline-secondary"');
		// The detached chevron navigation and the personal day link are gone.
		expect(page).not.toContain("My day");
		expect(page).not.toContain("bi-chevron-left");
		expect(page).not.toContain("bi-chevron-right");
	});

	test("test_page_is_a_normal_bootstrap_document", () => {
		expect(page).toContain('<main class="container-xl py-4">');
		expect(page).toContain("table-responsive border rounded");
		expect(page).toContain('<Table hover class="align-middle mb-0">');
		expect(page).toContain('<thead class="table-light">');
		expect(page).toContain("small text-body-secondary");
		expect(page).not.toContain("PlanLanes");
		expect(page).not.toContain("CapacityBar");
		expect(page).not.toContain("<Progress");
		expect(page).not.toContain("EmptyState");
		expect(page).not.toContain('class="card');
		expect(page).not.toContain("CardBody");
		expect(page).not.toContain("Dashboard");
	});

	test("test_capacity_summary_is_a_table", () => {
		expect(page).toMatch(/>\s*Net capacity\s*</);
		expect(page).toMatch(/>\s*Planning capacity\s*</);
		expect(page).toMatch(/>\s*Scheduled\s*</);
		expect(page).toMatch(/>\s*Available\s*</);
		expect(page).toContain("lane.maintainer.weeklyMinutes");
		expect(page).toContain("lane.capMinutes");
		expect(page).toContain("lane.committedMinutes");
		expect(page).toContain("lane.remainingMinutes");
		expect(page).toContain("signedMinutes(lane.remainingMinutes)");
		expect(page).toContain("function signedMinutes(minutes: number): string");
		expect(page).toContain("minutes < 0 ? `-${formatMinutes(Math.abs(minutes))}`");
		expect(page).toContain("text-end");
		expect(page).toContain("text-danger");
		expect(page).toContain("lane.over");
		// Net capacity folds into the assignee cell below md so the four
		// remaining numeric columns fit without a horizontal table scroll.
		expect(page).toContain("Net {formatMinutes(lane.maintainer.weeklyMinutes)}");
		expect(page).toContain("d-none d-md-table-cell");
	});
});

describe("plan tables", () => {
	test("test_scheduled_issues_are_a_deduped_table", () => {
		expect(page).toContain("const scheduled = $derived.by(");
		expect(page).toContain("const seen = new Set<string>();");
		expect(page).toContain("const key = issueKey(issue);");
		expect(page).toContain("seen.has(key)");
		expect(page).toContain(">Scheduled issues<");
		expect(page).toContain('data-testid="plan-table"');
		expect(page).toMatch(/>\s*Issue\s*</);
		expect(page).toMatch(/>\s*Title\s*</);
		expect(page).toMatch(/>\s*Assignee\s*</);
		expect(page).toMatch(/>\s*Size\s*</);
		expect(page).toMatch(/>\s*Hours\s*</);
		expect(page).toMatch(/>\s*Actions\s*</);
		expect(page).toContain("formatMinutes");
	});

	test("test_scheduled_rows_link_the_title_and_show_SML", () => {
		expect(page).toContain("issuePath('issues', issue.repo, issue.number)");
		expect(page).toContain("text-primary text-decoration-none");
		expect(page).toContain("return 'S';");
		expect(page).toContain("return 'M';");
		expect(page).toContain("return 'L';");
		expect(page).toContain("join(', ')");
		expect(page).toContain("|| '—'");
	});

	test("test_writers_get_remove_with_inline_retry", () => {
		expect(page).toContain("const mayWrite = $derived(canWrite(data.user?.role));");
		expect(page).toContain("unscheduleRequest(issue.repo, issue.number)");
		expect(page).toContain("await invalidateAll();");
		expect(page).toContain("<InlineStatus");
		expect(page).toContain("removeError");
		expect(page).toContain("Retry");
		expect(page).toContain("onclick={() => void remove(issue)}");
		expect(page).toContain("{#if mayWrite}");
	});

	test("test_unassigned_is_omitted_when_empty", () => {
		expect(page).toContain(
			"const unassigned = $derived(data.weekPlan?.unassigned.issues ?? []);",
		);
		expect(page).toContain("{#if unassigned.length > 0}");
		expect(page).toContain(">Unassigned issues<");
	});

	test("test_unestimated_issues_offer_an_estimate_action", () => {
		expect(page).toContain("const unestimated = $derived(data.weekPlan?.unestimated ?? []);");
		expect(page).toContain("{#if unestimated.length > 0}");
		expect(page).toContain(">Unestimated issues<");
		expect(page).toMatch(/>\s*Estimate\s*</);
		expect(page).toContain("aria-label={`Estimate ${issueKey(issue)}`}");
	});

	test("test_planned_unsized_issues_are_visible_commitments", () => {
		expect(page).toContain("const unsizedCommitted = $derived.by(");
		expect(page).toContain("lane.unsizedIssues");
		expect(page).toContain("unassigned.unsizedIssues");
		expect(page).toContain(">Committed without an estimate<");
		expect(page).toContain('data-testid="plan-unsized-table"');
		expect(page).toContain("They are commitments and add");
		expect(page).toContain("Needs estimate");
		// The empty week must not claim nothing is planned while an unsized
		// commitment exists.
		expect(page).toContain(
			"scheduled.length + unassigned.length + unsizedCommitted.length > 0",
		);
		expect(page).toContain("{lane.unsizedIssues.length} unsized");
	});

	test("test_mobile_columns_collapse_without_page_overflow", () => {
		expect(page).toContain("d-none d-md-table-cell");
		expect(page).toContain("d-md-none");
		expect(page).toContain("text-break");
		expect(page).toContain("table-responsive border rounded");
	});

	test("test_empty_week_is_a_concise_inline_message", () => {
		expect(page).toContain("Nothing is planned for this week.");
		expect(page).not.toContain("No issues match this view");
	});
});

describe("issue-level planning", () => {
	test("test_properties_card_has_a_planned_picker", () => {
		const card = source("../issue/IssuePropertiesCard.svelte");
		expect(card).toContain('for="issue-plan"');
		expect(card).toContain("planWeekOptions");
		expect(card).toContain("planEligibility");
		expect(card).toContain("onplan");
	});

	test("test_issue_page_owns_the_plan_mutation", () => {
		const issuePage = source("../issue/IssueDetailPage.svelte");
		expect(issuePage).toContain("scheduleRequest");
		expect(issuePage).toContain("unscheduleRequest");
		expect(issuePage).toContain("scheduleErrorMessage");
		expect(issuePage).toContain("onplan={setPlan}");
	});
});

describe("schedule errors", () => {
	test("test_cap_errors_surface_inline", () => {
		const message = scheduleErrorMessage(409, {
			message: "Week capacity exceeded",
			violations: [
				{
					login: "ann",
					capMinutes: 360,
					committedMinutes: 480,
					excessMinutes: 120,
				},
			],
		});

		expect(message).toContain("Week capacity exceeded");
		expect(message).toContain("ann (+120 min)");
		expect(scheduleErrorMessage(409, null)).toBe(
			"Could not schedule this issue (409).",
		);
		expect(scheduleErrorMessage(400, { message: "Issue is not estimated" })).toBe(
			"Issue is not estimated",
		);
	});
});
