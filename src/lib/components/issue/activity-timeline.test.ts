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
});
