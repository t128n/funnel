/**
 * Organization breadcrumbs use one labelled wrapper.
 *
 * The route contracts are asserted against source and the rendered browser
 * name is checked manually; this keeps the wrapper from drifting back to
 * unnamed `<nav>` elements on each page.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function source(relative: string): string {
	return readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");
}

const wrapper = source("src/lib/components/shell/Breadcrumbs.svelte");

describe("Breadcrumbs wrapper", () => {
	test("gives the navigation landmark its accessible name", () => {
		expect(wrapper).toContain('aria-label="breadcrumb"');
		expect(wrapper).toContain("active={index === items.length - 1}");
	});
});

describe("organization breadcrumbs", () => {
	const pages: Array<[string, string[]]> = [
		["src/routes/(app)/epics/+page.svelte", ["Workspace", "Epics"]],
		[
			"src/routes/(app)/epics/[owner]/[repo]/[number]/+page.svelte",
			["Workspace", "Epics", "epic.ref"],
		],
		["src/routes/(app)/milestones/+page.svelte", ["Workspace", "Milestones"]],
		[
			"src/routes/(app)/milestones/[owner]/[repo]/[number]/+page.svelte",
			["Workspace", "Milestones", "data.milestone.title"],
		],
		["src/routes/(app)/notifications/+page.svelte", ["Workspace", "Notifications"]],
		["src/routes/(app)/attention/+page.svelte", ["Workspace", "Attention"]],
	];

	for (const [file, labels] of pages) {
		test(`${file} carries the shared breadcrumb`, () => {
			const page = source(file);
			expect(page).toContain("<Breadcrumbs");
			for (const label of labels) expect(page).toContain(label);
		});
	}

	test("epic detail links back to the Epics index", () => {
		expect(
			source("src/routes/(app)/epics/[owner]/[repo]/[number]/+page.svelte"),
		).toContain("{ label: 'Epics', href: '/epics' }");
	});

	test("Inbox and submission pages use the labelled wrapper", () => {
		expect(source("src/routes/(app)/inbox/+page.svelte")).toContain(
			"<Breadcrumbs items={[{ label: 'Workspace', href: '/issues' }, { label: 'Inbox' }]} />",
		);
		expect(
			source("src/routes/(app)/inbox/submission/[id]/+page.svelte"),
		).toContain(
			"<Breadcrumbs items={[{ label: 'Inbox', href: '/inbox' }, { label: 'Submission' }]} />",
		);
	});

	test("issue detail breadcrumb has the accessible name", () => {
		expect(source("src/lib/components/issue/IssueDetailPage.svelte")).toContain(
			'<Breadcrumb class="mb-2" aria-label="breadcrumb">',
		);
	});

	test("milestone detail uses the breadcrumb instead of a back button", () => {
		const detail = source(
			"src/routes/(app)/milestones/[owner]/[repo]/[number]/+page.svelte",
		);
		expect(detail).not.toContain("backLink");
		expect(detail).not.toContain("bi-arrow-left");
	});
});
