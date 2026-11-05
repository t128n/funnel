import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("./IssueDetailPage.svelte", import.meta.url), "utf8");
const relations = readFileSync(
	new URL("./IssueRelations.svelte", import.meta.url),
	"utf8",
);

describe("issue relations card", () => {
	test("renders parent, sub-issue progress, children and dependency lists", () => {
		expect(relations).toContain("Relationships");
		expect(relations).toContain("relations.parent");
		expect(relations).toContain("Sub-issues");
		expect(relations).toContain('role="progressbar"');
		expect(relations).toContain("relations.progress.percent");
		expect(relations).toContain("relations.children");
		expect(relations).toContain("relations.blockedBy");
		expect(relations).toContain("relations.blocking");
		expect(relations).toContain("Blocked by");
		expect(relations).toContain("Blocking");
		expect(relations).toContain("issuePath('issues', ref.repo, ref.number)");
		expect(relations).toContain("Closed");
		expect(relations).toContain("Open");
	});

	test("hides itself when GitHub returned nothing", () => {
		expect(relations).toContain("{#if hasAny}");
		expect(relations).toContain("relations.children.length > 0");
	});

	test("states that GitHub dependencies are separate from the manual blocked flag", () => {
		expect(relations).toContain(
			"GitHub dependency, separate from Funnel's manual blocked flag.",
		);
		expect(relations).not.toContain("BlockedText");
		expect(relations).not.toContain("blockIssue");
	});

	test("the issue page renders the card beside the pull-request panel", () => {
		expect(page).toContain("import IssueRelations from");
		expect(page).toContain("<IssueRelations relations={detail.relations} />");
		const pullRequests = page.indexOf("<LinkedPullRequests");
		const card = page.indexOf("<IssueRelations");
		expect(pullRequests).toBeGreaterThan(-1);
		expect(card).toBeGreaterThan(pullRequests);
	});

	test("the manual blocked flag remains a separate control", () => {
		expect(page).toContain("blockerActive");
		expect(page).toContain("<BlockedText />");
		expect(page).toContain("blocked={blockerActive}");
		expect(page).toContain("onblock={openBlockDialog}");
	});
});
