import { describe, expect, test } from "bun:test";
import { scheduleErrorMessage, scheduleRequest, scheduleWeekFor, unscheduleRequest } from "./schedule";

describe("scheduleRequest", () => {
	test("test_schedule_request_encodes_path", () => {
		const request = scheduleRequest("orgA/core", 7, "2026-10-19");
		expect(request.url).toBe("/api/repos/orgA/core/issues/7/plan");
		expect(request.method).toBe("PUT");
		expect(request.body).toBe('{"week_start":"2026-10-19"}');
	});

	test("encodes repo segments", () => {
		const request = scheduleRequest("acme/web app", 12, "2026-10-26");
		expect(request.url).toBe("/api/repos/acme/web%20app/issues/12/plan");
	});
});

describe("unscheduleRequest", () => {
	test("uses DELETE on the same path", () => {
		const request = unscheduleRequest("orgA/core", 7);
		expect(request).toEqual({
			url: "/api/repos/orgA/core/issues/7/plan",
			method: "DELETE",
		});
	});
});

describe("scheduleWeekFor", () => {
	test("test_cycle_horizon_schedules_into_visible_cycle", () => {
		// `?horizon=cycle&cycle=2026-09-07` keeps the hidden current week;
		// the dialog must not schedule outside the cycle on screen.
		expect(scheduleWeekFor("cycle", "2026-10-19", "2026-09-07")).toBe(
			"2026-09-07",
		);
		expect(scheduleWeekFor("week", "2026-10-19", "2026-09-07")).toBe(
			"2026-10-19",
		);
	});

	test("falls back to the week when the cycle start is unknown", () => {
		expect(scheduleWeekFor("cycle", "2026-10-19", "")).toBe("2026-10-19");
	});
});
