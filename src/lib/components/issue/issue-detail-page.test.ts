/**
 * Composition A issue page contracts.
 *
 * Svelte components are not rendered in Bun, so the same source-read approach
 * used by the timeline and row tests pins the layout order and the metadata
 * editing decisions without a browser.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("./IssueDetailPage.svelte", import.meta.url), "utf8");
const properties = readFileSync(
	new URL("./IssuePropertiesCard.svelte", import.meta.url),
	"utf8",
);
const details = readFileSync(new URL("./IssueDetailsCard.svelte", import.meta.url), "utf8");
const route = readFileSync(
	new URL(
		"../../../routes/(app)/issues/[owner]/[repo]/[number]/+page.svelte",
		import.meta.url,
	),
	"utf8",
);
const composer = readFileSync(new URL("../detail/Composer.svelte", import.meta.url), "utf8");

describe("issue detail page", () => {
	test("test_route_is_a_dedicated_page_with_an_8_4_document_and_rail", () => {
		expect(route).toContain('<main class="container-lg py-4" aria-label="Issue">');
		expect(page).toContain('class="row g-4 mt-2"');
		expect(page).toContain('class="col-lg-8"');
		expect(page).toContain('class="col-lg-4"');
	});

	test("test_document_and_activity_precede_the_rail_in_dom_order", () => {
		const document = page.indexOf('aria-label="Description"');
		const activity = page.indexOf('aria-label="Activity"');
		const rail = page.indexOf('class="col-lg-4"');
		expect(document).toBeGreaterThan(-1);
		expect(activity).toBeGreaterThan(document);
		expect(rail).toBeGreaterThan(activity);
	});

	test("test_pane_chrome_and_previous_next_navigation_are_gone", () => {
		expect(page).not.toContain("DetailShell");
		expect(page).not.toContain("onclose");
		expect(page).not.toContain("inspector-title");
		expect(page).not.toContain("Previous issue");
		expect(page).not.toContain("Next issue");
		expect(page).toContain('href="/issues"');
	});

	test("test_untriaged_alert_accepts_into_backlog_and_links_to_inbox", () => {
		expect(page).toContain("isUntriaged(issue)");
		expect(page).toContain('<Alert');
		expect(page).toContain("setStatus('backlog')");
		expect(page).toContain('href="/inbox"');
		expect(page).toContain("This issue is still in the Inbox and has not been triaged.");
	});

	test("test_comments_keep_anchors_paging_and_cmd_enter", () => {
		expect(page).toContain("Load earlier comments");
		expect(page).toContain("<ActivityTimeline");
		expect(page).toContain("No comments yet.");
		expect(composer).toContain("event.metaKey || event.ctrlKey");
		expect(composer).toContain('id="issue-composer"');
	});
});

describe("properties card", () => {
	test("test_metadata_controls_are_labeled_and_commit_immediately", () => {
		expect(properties).toContain('<h2 class="h6 mb-3">Properties</h2>');
		for (const field of ["Status", "Impact", "Urgency", "Size"]) {
			expect(properties).toContain(`class="form-label small" for="issue-${field.toLowerCase()}"`);
		}
		expect(properties).not.toContain("<Button");
		expect(properties).not.toContain("<form");
	});

	test("test_priority_stays_derived_and_is_edited_through_its_axes", () => {
		expect(properties).toContain("<PriorityText");
		expect(properties).toContain("Derived from impact and urgency.");
		expect(properties).toContain("IMPACT_SCALE");
		expect(properties).toContain("URGENCY_SCALE");
		expect(properties).toContain("onpriority(axis");
		expect(properties).toContain("changeAxis('impact'");
		expect(properties).toContain("changeAxis('urgency'");
		// A direct priority write would drop one of the two axes.
		expect(properties).not.toContain("updateIssue");
		expect(properties).toContain("priority={issue.priority}");
	});

	test("test_multi_assignee_and_labels_are_preserved", () => {
		expect(properties).toContain("<MultiSelect");
		expect(properties).toContain("selected={assigneeLogins}");
		expect(properties).toContain("selected={labels}");
	});

	test("test_read_only_viewers_get_plain_text_values", () => {
		expect(properties).toContain("{:else}");
		expect(properties).toContain("<StatusText");
		expect(properties).toContain("Unassigned");
		expect(properties).toContain("No milestone");
	});
});

describe("details card", () => {
	test("test_details_rows_follow_the_approved_order", () => {
		const labels = [
			"Repository",
			"Epic",
			"Severity",
			"Reporter",
			"Opened",
			"Updated",
			"Blocked",
			"Watching",
		];
		let cursor = -1;
		for (const label of labels) {
			const index = details.indexOf(`>${label}</dt>`);
			expect(index).toBeGreaterThan(cursor);
			cursor = index;
		}
		expect(details).toContain('<dl class="row small mb-0">');
		expect(details).toContain("col-5");
		expect(details).toContain("col-7");
	});

	test("test_time_and_delays_follow_the_definition_list", () => {
		const dl = details.indexOf("</dl>");
		expect(details.indexOf("<IssueTimeCard")).toBeGreaterThan(dl);
		expect(details.indexOf("<DelayList")).toBeGreaterThan(dl);
		expect(details).toContain("<EpicProperty");
	});
});
