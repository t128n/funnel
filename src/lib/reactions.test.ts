import { describe, expect, test } from "bun:test";
import {
	emptyReactions,
	isReactionContent,
	normalizeGraphqlReactions,
	toggleReaction,
} from "./reactions";

describe("reaction vocabulary", () => {
	test("test_known_reaction_names", () => {
		expect(isReactionContent("+1")).toBe(true);
		expect(isReactionContent("rocket")).toBe(true);
		expect(isReactionContent("thumbsup")).toBe(false);
		expect(isReactionContent(null)).toBe(false);
	});

	test("test_graphql_groups_normalise_to_github_names", () => {
		const summary = normalizeGraphqlReactions(
			[
				{ content: "THUMBS_UP", users: { totalCount: 3 } },
				{ content: "HOORAY", users: { totalCount: 1 } },
				{ content: "SOMETHING_NEW", users: { totalCount: 9 } },
				{ content: "HEART", users: { totalCount: 0 } },
			],
			4,
		);
		expect(summary).toEqual({
			total: 4,
			counts: { "+1": 3, hooray: 1 },
			viewerReacted: [],
		});
	});

	test("test_graphql_groups_fall_back_to_the_counted_total", () => {
		const summary = normalizeGraphqlReactions([
			{ content: "EYES", users: { totalCount: 2 } },
		]);
		expect(summary.total).toBe(2);
		expect(summary.counts.eyes).toBe(2);
	});

	test("test_toggle_adds_and_removes_the_viewer_chip", () => {
		const base = { total: 1, counts: { heart: 1 }, viewerReacted: [] as const };
		const added = toggleReaction(
			{ ...base, viewerReacted: [] },
			"heart",
			true,
		);
		expect(added).toEqual({
			total: 2,
			counts: { heart: 2 },
			viewerReacted: ["heart"],
		});
		const removed = toggleReaction(added, "heart", false);
		expect(removed).toEqual({
			total: 1,
			counts: { heart: 1 },
			viewerReacted: [],
		});
		expect(toggleReaction(removed, "heart", false)).toBe(removed);
	});

	test("test_toggle_never_goes_below_zero", () => {
		const removed = toggleReaction(
			{ total: 0, counts: {}, viewerReacted: ["eyes"] },
			"eyes",
			false,
		);
		expect(removed).toEqual(emptyReactions());
	});
});
