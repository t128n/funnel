import { describe, expect, test } from "bun:test";
import type { RepoMilestoneRef } from "#lib/server/issues/types";
import { milestonePropertyLabel } from "./milestone-format";

/** Noon on the due date, so "today" is unambiguous in UTC. */
const NOW = Date.parse("2026-11-08T12:00:00Z");

function milestone(
	overrides: Partial<RepoMilestoneRef> = {},
): RepoMilestoneRef {
	return {
		repo: "t128n/funnel",
		number: 7,
		title: "Bugzilla pass",
		state: "open",
		dueOn: Date.parse("2026-11-08T00:00:00Z"),
		...overrides,
	};
}

describe("milestonePropertyLabel", () => {
	test("an issue without a milestone has no title or detail", () => {
		expect(milestonePropertyLabel(null, NOW)).toEqual({
			title: null,
			detail: null,
			detailTitle: null,
			tone: "muted",
		});
	});

	test("shows the title and due date for an open milestone", () => {
		expect(milestonePropertyLabel(milestone(), NOW)).toEqual({
			title: "Bugzilla pass",
			detail: "due 8 Nov 2026",
			detailTitle: "8 Nov 2026",
			tone: "muted",
		});
	});

	test("a milestone without a due date shows the title only", () => {
		expect(
			milestonePropertyLabel(milestone({ dueOn: null }), NOW),
		).toEqual({
			title: "Bugzilla pass",
			detail: null,
			detailTitle: null,
			tone: "muted",
		});
	});

	test("an overdue open milestone marks the date as danger", () => {
		const label = milestonePropertyLabel(
			milestone({ dueOn: Date.parse("2026-11-07T00:00:00Z") }),
			NOW,
		);
		expect(label.detail).toBe("due 7 Nov 2026");
		expect(label.tone).toBe("danger");
		expect(label.title).toBe("Bugzilla pass");
	});

	test("a closed milestone shows closed and never reads overdue", () => {
		const label = milestonePropertyLabel(
			milestone({
				state: "closed",
				dueOn: Date.parse("2026-11-01T00:00:00Z"),
			}),
			NOW,
		);
		expect(label).toEqual({
			title: "Bugzilla pass",
			detail: "closed",
			detailTitle: null,
			tone: "muted",
		});
	});

	test("a milestone due today is not overdue", () => {
		expect(milestonePropertyLabel(milestone(), NOW).tone).toBe("muted");
	});

	test("a milestone due yesterday is overdue", () => {
		expect(
			milestonePropertyLabel(
				milestone({ dueOn: Date.parse("2026-11-07T00:00:00Z") }),
				NOW,
			).tone,
		).toBe("danger");
	});
});
