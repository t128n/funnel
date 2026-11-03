/**
 * Issue detail polish contracts.
 *
 * Svelte components are not rendered in Bun, so the same source-read approach
 * used by the activity timeline tests keeps the reading order and the single
 * triage strip from regressing.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const inspector = readFileSync(new URL("./InspectorPane.svelte", import.meta.url), "utf8");
const composer = readFileSync(new URL("../detail/Composer.svelte", import.meta.url), "utf8");

describe("issue detail", () => {
	test("test_triage_values_live_once_in_the_header_strip", () => {
		expect(inspector).toContain('aria-label="Issue triage"');
		for (const label of ["Status", "Priority", "Size", "Assignee", "Milestone"]) {
			expect(inspector).not.toContain(`<dt>${label}</dt>`);
		}
	});

	test("test_size_is_editable_from_the_triage_strip", () => {
		const triage = inspector.indexOf('aria-label="Issue triage"');
		const sizePicker = inspector.indexOf('data-picker="size"');
		const activity = inspector.indexOf('aria-label="Activity"');
		expect(triage).toBeGreaterThan(-1);
		expect(sizePicker).toBeGreaterThan(triage);
		expect(sizePicker).toBeLessThan(activity);
		expect(inspector).toContain("Not estimated");
	});

	test("test_secondary_properties_use_native_details_below_activity", () => {
		expect(inspector).toContain("<details");
		expect(inspector).toContain("<summary");
		const activity = inspector.indexOf('aria-label="Activity"');
		const details = inspector.indexOf("<details");
		expect(activity).toBeGreaterThan(-1);
		expect(details).toBeGreaterThan(activity);
	});

	test("test_active_blocker_sits_above_the_description", () => {
		const blocker = inspector.indexOf('aria-label="Blocker"');
		const description = inspector.indexOf('aria-label="Description"');
		expect(blocker).toBeGreaterThan(-1);
		expect(description).toBeGreaterThan(blocker);
	});

	test("test_composer_is_a_compact_prompt_that_expands_in_place", () => {
		expect(composer).toContain("const expanded = $derived(!collapsed && (open || hasDraft));");
		expect(composer).toContain("h-(--size-control-comfortable)");
		expect(composer).toContain("pl-9");
		expect(composer).toContain("message-square");
		expect(composer).toContain("event.metaKey || event.ctrlKey");
		expect(composer).toContain("event.key === 'Escape'");
	});
});
