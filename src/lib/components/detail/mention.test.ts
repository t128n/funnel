import { describe, expect, test } from "bun:test";
import {
	activeMentionAt,
	applyMention,
	filterMentions,
} from "./mention";

describe("mention autocomplete", () => {
	test("test_detects_a_mention_after_a_boundary", () => {
		expect(activeMentionAt("hi @oc", 6)).toEqual({ start: 3, query: "oc" });
		expect(activeMentionAt("@oc", 3)).toEqual({ start: 0, query: "oc" });
		expect(activeMentionAt("(@oc", 4)).toEqual({ start: 1, query: "oc" });
		expect(activeMentionAt("hi @", 4)).toEqual({ start: 3, query: "" });
	});

	test("test_ignores_emails_and_finished_tokens", () => {
		expect(activeMentionAt("me@example.com", 14)).toBeNull();
		expect(activeMentionAt("hi there", 8)).toBeNull();
		expect(activeMentionAt("hi @oc and more", 16)).toBeNull();
	});

	test("test_filters_case_insensitively_and_limits", () => {
		const people = [
			{ login: "alice" },
			{ login: "Alice-2" },
			{ login: "bob" },
			{ login: "al" },
			{ login: "carol" },
		];
		expect(filterMentions(people, "al", 2).map((p) => p.login)).toEqual([
			"al",
			"alice",
		]);
		expect(filterMentions(people, "zzz")).toEqual([]);
	});

	test("test_applies_the_login_at_the_caret", () => {
		const mention = activeMentionAt("Please @al review", 10);
		expect(mention).not.toBeNull();
		const applied = applyMention("Please @al review", 10, mention!, "alice");
		expect(applied.value).toBe("Please @alice review");
		expect(applied.caret).toBe("Please @alice".length);
	});

	test("test_replaces_a_partial_login_after_the_caret", () => {
		const mention = activeMentionAt("cc @al", 5);
		const applied = applyMention("cc @alice please", 5, mention!, "alice");
		expect(applied.value).toBe("cc @alice please");
	});

	test("test_does_not_double_a_trailing_space", () => {
		const mention = activeMentionAt("cc @al", 5);
		const applied = applyMention("cc @al ", 5, mention!, "alice");
		expect(applied.value).toBe("cc @alice ");
	});
});
