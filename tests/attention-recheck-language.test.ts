/**
 * Attention presents re-check dates, not due dates.
 *
 * The page must name the dimension visibly, the bucket and row labels must say
 * "Re-check", and the undated row must show one phrase only.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function source(relative: string): string {
	return readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");
}

const page = source("src/routes/(app)/attention/+page.svelte");
const row = source("src/lib/components/attention/AttentionRow.svelte");

describe("Attention re-check language", () => {
	test("the page states what the buckets mean", () => {
		expect(page).toContain(
			'description="Blocked issues grouped by re-check date, plus issues waiting on someone else."',
		);
	});

	test("bucket labels name the re-check dimension", () => {
		expect(page).toContain("label: 'Re-check overdue'");
		expect(page).toContain("label: 'Re-check today'");
		expect(page).toContain("label: 'Re-check upcoming'");
		expect(page).toContain("label: 'No re-check date'");
	});

	test("row urgency labels name the re-check dimension", () => {
		expect(row).toContain("'Re-check overdue'");
		expect(row).toContain("'Re-check today'");
		expect(row).toContain("'Re-check upcoming'");
		expect(row).not.toContain("'Due today'");
	});

	test("the undated state renders one phrase", () => {
		expect(row).toContain("urgency !== 'unscheduled'");
		expect(row).not.toContain("'No date'");
		expect(row).toContain("'No re-check date'");
	});

	test("waiting has its own section, separate from blocked groups", () => {
		expect(page).toContain("<WaitingRow");
		expect(page).toContain("Waiting on others");
		expect(page).toContain("staleWaiting");
	});
});
