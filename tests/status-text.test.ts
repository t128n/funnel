/**
 * Status, blocked and missing status are separate dimensions.
 *
 * `StatusText` owns the workflow status only; blocked is a sibling indicator,
 * and an absent status reads "No status" rather than triage vocabulary.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function source(relative: string): string {
	return readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");
}

describe("StatusText", () => {
	const status = source("src/lib/components/common/StatusText.svelte");

	test("renders the real workflow status and never borrows Unconfirmed", () => {
		expect(status).not.toContain("Unconfirmed");
		expect(status).toContain("'No status'");
		expect(status).toContain("'in-progress'");
		expect(status).toContain("'in-review'");
		expect(status).toContain("'backlog'");
		expect(status).toContain("'todo'");
	});

	test("does not replace the status word when blocked", () => {
		// Blocked is appended after the status span, not selected first.
		const wordBlock = status.slice(status.indexOf("const word"), status.indexOf("const tone"));
		expect(wordBlock).not.toContain("blocked");
		expect(status).toContain("<BlockedText />");
	});

	test("standalone blocked surfaces use BlockedText", () => {
		for (const file of [
			"src/lib/components/issue/IssueDetailsCard.svelte",
			"src/lib/components/issue/IssueDetailPage.svelte",
			"src/lib/components/board/BoardCard.svelte",
		]) {
			const page = source(file);
			expect(page).toContain("BlockedText");
			expect(page).not.toContain("<StatusText blocked");
		}
	});

	test("status columns still pass the blocked flag alongside the status", () => {
		for (const file of [
			"src/lib/components/issue/IssueTable.svelte",
			"src/lib/components/issue/IssueRow.svelte",
		]) {
			expect(source(file)).toContain("blocked={issue.blocked}");
		}
	});
});

describe("epic status", () => {
	test("list and detail both use the epic issue's real status", () => {
		expect(source("src/lib/components/epics/EpicList.svelte")).toContain(
			"<StatusText status={epic.status} state={epic.state} />",
		);
		expect(
			source("src/routes/(app)/epics/[owner]/[repo]/[number]/+page.svelte"),
		).toContain("<StatusText status={epic.issue.status} state={epic.state} />");
		expect(source("src/lib/server/epics/queries.ts")).toContain(
			"status: string | null;",
		);
	});
});
