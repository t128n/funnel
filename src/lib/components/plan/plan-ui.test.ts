/**
 * Planner component contracts.
 *
 * Bun cannot render Svelte components without the Vite plugin, so the render
 * contracts are checked by reading the markup the components must contain (the
 * same source-read style as `tests/planning-page.test.ts`).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { scheduleErrorMessage } from "./schedule";

function source(relative: string): string {
	return readFileSync(new URL(relative, import.meta.url), "utf8");
}

describe("capacity language", () => {
	test("test_bars_state_scheduled_of_cap_without_an_allocation_marker", () => {
		const bar = source("./CapacityBar.svelte");
		expect(bar).toContain("Scheduled {formatMinutes(committedMinutes)} of");
		expect(bar).toContain("cap");
		// The cap already includes allocation; a second 60% marker would
		// double-count it.
		expect(bar).not.toContain("allocationPercent");
		expect(bar).not.toContain("inset-inline-start");
	});

	test("test_lanes_label_net_cap_and_compact_empty_groups", () => {
		const lanes = source("./PlanLanes.svelte");
		expect(lanes).toContain("Net {formatMinutes(lane.maintainer.weeklyMinutes)}/week");
		expect(lanes).toContain("Cap ${formatMinutes(lane.capMinutes)}");
		expect(lanes).toContain("Scheduled {formatMinutes(unassigned.committedMinutes)} · no cap");
		expect(lanes).toContain("every sized issue has an active assignee");
		expect(lanes).toContain("every open issue has a size");
		// Scheduling lives on the issue, not in a second picker on the lane page.
		expect(lanes).not.toContain("Schedule Issue");
		expect(lanes).toContain("Browse issues");
	});
});

describe("plan page", () => {
	test("test_week_page_renders_lanes", () => {
		const page = source("../../../routes/(app)/plan/+page.svelte");
		expect(page).toContain("<PlanLanes");
		expect(page).toContain("lanes={data.weekPlan.lanes}");
		expect(page).toContain("unassigned={data.weekPlan.unassigned}");
		expect(page).toContain("unestimated={data.weekPlan.unestimated}");
		expect(page).toContain("weekHeadline");

		const lanes = source("./PlanLanes.svelte");
		expect(lanes).toContain('data-testid="plan-lanes"');
		expect(lanes).toContain("data-lane={lane.maintainer.login}");
		expect(lanes).toContain("<CapacityBar");
	});

	test("test_the_mega_page_is_gone", () => {
		const page = source("../../../routes/(app)/plan/+page.svelte");
		expect(page).not.toContain("horizon");
		expect(page).not.toContain("ScheduleDialog");
		expect(page).not.toContain("DayPlan");
		expect(page).not.toContain("MilestonePlans");
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
		const page = source("../issue/IssueDetailPage.svelte");
		expect(page).toContain("scheduleRequest");
		expect(page).toContain("unscheduleRequest");
		expect(page).toContain("scheduleErrorMessage");
		expect(page).toContain("onplan={setPlan}");
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
