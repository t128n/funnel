/**
 * Organization tables: the epic list, epic child table and milestone list.
 *
 * The layout contracts are asserted against the component source because the
 * column classes are the fix; the overdue rule is pure and tested directly.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
	isMilestoneOverdue,
	milestoneDueLabel,
	milestoneProgress,
} from "#lib/milestone-format";

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-04T00:00:00Z");

function source(relative: string): string {
	return readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");
}

const milestone = (
	overrides: Partial<{
		state: string;
		dueOn: number | null;
		openIssues: number;
		closedIssues: number;
	}> = {},
) => ({
	state: "open",
	dueOn: NOW - 10 * DAY,
	openIssues: 5,
	closedIssues: 1,
	...overrides,
});

describe("epic list", () => {
	test("the title is the primary link and the ref stays secondary", () => {
		const list = source("src/lib/components/epics/EpicList.svelte");
		expect(list).toContain("class=\"text-primary text-decoration-none text-break\"");
		expect(list).toContain("{epic.title || 'Untitled epic'}");
		// The ref remains a second link in a nowrap cell at md and above.
		expect(list).toContain("{epic.repo}#{epic.number}");
	});

	test("secondary columns fold into metadata instead of scrolling", () => {
		const list = source("src/lib/components/epics/EpicList.svelte");
		expect(list).toContain("funnel-table--fluid");
		expect(list).toContain("d-lg-none");
		expect(list).toContain("Estimate {formatMinutes(epic.estimateMinutes)}");
		expect(list).toContain("d-none d-lg-table-cell");
	});

	test("fluid tables drop the desktop minimum width below md", () => {
		const css = source("src/lib/styles/app.css");
		expect(css).toContain(".funnel-table--fluid");
		expect(css).toContain("min-width: 0;");
	});
});

describe("epic child table", () => {
	test("time columns hide and the remove action stays in an always-visible column", () => {
		const table = source("src/lib/components/epics/EpicChildTable.svelte");
		expect(table).toContain("funnel-table--fluid");
		expect(table).toContain("d-none d-lg-table-cell");
		expect(table).toContain("Remove ${item.ref} from the epic");
		// The remove cell has no responsive hiding class.
		expect(table).toMatch(/<td class="text-end">[\s\S]*?Remove from epic/);
	});

	test("status and time rollups appear under the title below md", () => {
		const table = source("src/lib/components/epics/EpicChildTable.svelte");
		expect(table).toContain("d-md-none mt-1 d-flex flex-wrap");
		expect(table).toContain("<StatusText status={item.status} state={item.state} />");
	});
});

describe("milestone format", () => {
	test("progress is closed over the whole milestone", () => {
		expect(milestoneProgress(milestone())).toBeCloseTo(1 / 6);
		expect(
			milestoneProgress(milestone({ openIssues: 0, closedIssues: 4 })),
		).toBe(1);
		expect(
			milestoneProgress(milestone({ openIssues: 0, closedIssues: 0 })),
		).toBe(0);
	});

	test("past due with open work is overdue", () => {
		expect(isMilestoneOverdue(milestone(), NOW)).toBe(true);
	});

	test("future, complete, closed and undated milestones are not overdue", () => {
		expect(isMilestoneOverdue(milestone({ dueOn: NOW + 10 * DAY }), NOW)).toBe(
			false,
		);
		expect(
			isMilestoneOverdue(milestone({ openIssues: 0, closedIssues: 4 }), NOW),
		).toBe(false);
		expect(isMilestoneOverdue(milestone({ state: "closed" }), NOW)).toBe(false);
		expect(isMilestoneOverdue(milestone({ dueOn: null }), NOW)).toBe(false);
	});

	test("dates render as UTC calendar days", () => {
		expect(milestoneDueLabel(Date.parse("2026-10-20T00:00:00Z"))).toBe(
			"2026-10-20",
		);
		expect(milestoneDueLabel(null)).toBeNull();
	});

	test("the list and detail use the shared Overdue treatment", () => {
		const list = source("src/routes/(app)/milestones/+page.svelte");
		const detail = source(
			"src/routes/(app)/milestones/[owner]/[repo]/[number]/+page.svelte",
		);
		for (const page of [list, detail]) {
			expect(page).toContain("isMilestoneOverdue");
			expect(page).toContain("Overdue ·");
			expect(page).toContain("bi-exclamation-circle");
			expect(page).toContain("text-danger");
		}
	});
});
