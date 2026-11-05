/**
 * Issue thread contracts.
 *
 * Bun cannot import a Svelte component's `<script module>` exports, so the pure
 * helper is transpiled out of the component source and evaluated. The ruled
 * markup is checked by source read, the same way `plan-ui.test.ts` checks
 * components.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const timeline = readFileSync(new URL("./ActivityTimeline.svelte", import.meta.url), "utf8");

function moduleExport(source: string, name: string): unknown {
	const block = source.match(/<script module[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? "";
	const stripped = block.replace(/^(\s*)export\s+/gm, "$1");
	const js = new Bun.Transpiler({ loader: "ts" }).transformSync(stripped);
	return new Function(`${js}\nreturn ${name};`)();
}

const commentNumber = moduleExport(timeline, "commentNumber") as (index: number) => string;

describe("issue comment thread", () => {
	test("test_comment_numbers_are_one_based_anchors", () => {
		expect(commentNumber(0)).toBe("#c1");
		expect(commentNumber(11)).toBe("#c12");
	});

	test("test_thread_uses_ruled_activity_entries", () => {
		// Entries are stable anchors and the body keeps the sanitized HTML.
		expect(timeline).toContain('class="activity-entry');
		expect(timeline).toContain('class="markdown"');
		expect(timeline).toContain("data-index={index}");
		expect(timeline).toContain("{@html entry.comment.bodyHtml}");
	});

	test("test_own_comments_get_edit_and_delete_actions", () => {
		expect(timeline).toContain("oncommentedit");
		expect(timeline).toContain("oncommentdelete");
		expect(timeline).toContain("mayModerate");
		expect(timeline).toContain("entry.comment.author?.login === viewerLogin");
		expect(timeline).toContain("Edit comment");
		expect(timeline).toContain("Delete comment");
	});

	test("test_comments_render_reaction_counts_and_a_picker", () => {
		expect(timeline).toContain("REACTION_CONTENTS");
		expect(timeline).toContain("aria-label=\"Reactions\"");
		expect(timeline).toContain("aria-pressed={hasReacted(comment, content)}");
		expect(timeline).toContain("Add a reaction");
		expect(timeline).toContain("Choose a reaction");
		expect(timeline).toContain("onreaction(comment.externalId, content");
	});

	test("test_history_entries_merge_into_the_ruled_timeline", () => {
		expect(timeline).toContain("history?: IssueHistoryItem[]");
		expect(timeline).toContain("'all' | 'comments' | 'notes' | 'history'");
		expect(timeline).toContain(
			"{ kind: 'history'; at: number; history: IssueHistoryItem }",
		);
		expect(timeline).toContain("entry.kind === 'history'");
		expect(timeline).toContain("entry.history.summary");
		expect(timeline).toContain("bi-clock-history");
		expect(timeline).toContain(
			"data-tone={entry.kind === 'note' ? 'note' : entry.kind === 'history' ? 'history' : undefined}",
		);
		// History entries are informational: no reply affordance.
		expect(timeline).toContain("onreply && entry.kind !== 'history'");
	});
});
