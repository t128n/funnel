/**
 * Planner component contracts (SPEC §5).
 *
 * Bun cannot render Svelte components without the Vite plugin, so the render
 * contracts are checked two ways: the pure helpers the components delegate to,
 * and the markup the components must contain (the same source-read style as
 * `tests/planning-page.test.ts`).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { milestoneCap } from "./format";
import { scheduleErrorMessage } from "./schedule";

function source(relative: string): string {
	return readFileSync(new URL(relative, import.meta.url), "utf8");
}

describe("milestone plans", () => {
	test("test_milestone_without_due_shows_no_bar", () => {
		expect(milestoneCap(null, 720)).toBeNull();
		expect(milestoneCap(0, 720)).toBe(720);
		expect(milestoneCap(2, 720)).toBe(720);

		// The no-cap branch renders hours and no progressbar.
		const bar = source("./CapacityBar.svelte");
		const none = bar.slice(
			bar.indexOf("{#if capMinutes === null}"),
			bar.indexOf("{:else}"),
		);
		expect(none).toContain('data-cap="none"');
		expect(none).not.toContain("progressbar");

		expect(source("./MilestonePlans.svelte")).toContain(
			"milestoneCap(plan.capacityWeeks, lane.capMinutes)",
		);
	});
});

describe("schedule dialog", () => {
	test("test_dialog_errors_surface", () => {
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

		const dialog = source("./ScheduleDialog.svelte");
		expect(dialog).toContain("scheduleErrorMessage(409, payload)");
		expect(dialog).toContain('data-testid="schedule-error"');
		expect(dialog).toContain("await invalidateAll()");
	});
});

describe("plan page", () => {
	test("test_week_page_renders_lanes", () => {
		const page = source("../../../routes/(app)/plan/+page.svelte");
		expect(page).toContain("<PlanLanes");
		expect(page).toContain("lanes={data.weekPlan.lanes}");
		expect(page).toContain("unassigned={data.weekPlan.unassigned}");
		expect(page).toContain("unestimated={data.weekPlan.unestimated}");
		expect(page).toContain("week={scheduleWeek}");

		const lanes = source("./PlanLanes.svelte");
		expect(lanes).toContain('data-testid="plan-lanes"');
		expect(lanes).toContain("data-lane={lane.maintainer.login}");
		expect(lanes).toContain("<CapacityBar");
	});
});
