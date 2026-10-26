import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { panel } from "#lib/components/primitives/styles";

const root = join(import.meta.dir, "..");
const dir = join(root, "src/lib/components/primitives");
const families = ["badge", "alert", "card", "empty", "item"] as const;

function source(family: string, file: string): string {
	return readFileSync(join(dir, family, file), "utf8");
}

function svelteFiles(family: string): string[] {
	return readdirSync(join(dir, family)).filter((file) => file.endsWith(".svelte"));
}

function familySource(family: string): string {
	return svelteFiles(family)
		.map((file) => source(family, file))
		.join("\n");
}

describe("status and surfaces primitives", () => {
	test("card is a flat 4px panel", () => {
		const card = source("card", "card.svelte");

		expect(panel).toContain("rounded-lg");
		expect(panel).toContain("border-border");
		expect(card).toContain('from "../styles.js"');
		expect(card).toContain("panel");
		expect(card).toContain("p-3");
		expect(card).toContain("shadow-none");
		expect(card).not.toContain("ring-1");
		expect(card).not.toContain("rounded-xl");
	});

	test("badge is a token", () => {
		const badge = source("badge", "badge.svelte");

		expect(badge).toContain("rounded-none");
		expect(badge).toContain("font-mono");
		expect(badge).toContain("text-2xs");
		expect(badge).toContain("uppercase");
		expect(badge).toContain("bg-muted");
		expect(badge).not.toContain("rounded-4xl");
		expect(badge).not.toContain("tailwind-variants");
	});

	test("destructive alert colours the token, not a shell", () => {
		const alert = source("alert", "alert.svelte");

		expect(alert).toContain("border-l-2");
		expect(alert).toContain("border-l-destructive");
		expect(alert).toContain("text-destructive");
		expect(alert).not.toContain("bg-destructive");
	});

	test("card slots render", () => {
		const slots: Record<string, string> = {
			"card.svelte": "card",
			"card-header.svelte": "card-header",
			"card-title.svelte": "card-title",
			"card-description.svelte": "card-description",
			"card-content.svelte": "card-content",
			"card-footer.svelte": "card-footer",
			"card-action.svelte": "card-action"
		};

		for (const [file, slot] of Object.entries(slots)) {
			expect(source("card", file)).toContain(`data-slot="${slot}"`);
		}

		const index = source("card", "index.ts");
		for (const name of [
			"Root",
			"Header",
			"Title",
			"Description",
			"Content",
			"Footer",
			"Action",
			"CardHeader",
			"CardFooter"
		]) {
			expect(index).toContain(name);
		}
	});

	test("surfaces stay flat", () => {
		const all = families.map(familySource).join("\n");

		for (const banned of [
			"rounded-full",
			"rounded-4xl",
			"rounded-xl",
			"rounded-3xl",
			"bg-primary",
			"bg-secondary",
			"bg-destructive",
			"bg-accent",
			"dark:",
			"animate-",
			"tailwind-variants",
			"ring-",
			"backdrop-blur",
			"gradient"
		]) {
			expect(all).not.toContain(banned);
		}
	});

	test("item is a flat row", () => {
		const item = source("item", "item.svelte");

		expect(item).toContain("rounded-none");
		expect(item).toContain("hover:bg-muted");
		expect(item).toContain('"default" | "outline"');
	});

	test("empty media is muted", () => {
		const media = source("empty", "empty-media.svelte");

		expect(media).toContain("bg-muted");
		expect(media).toContain("text-muted-foreground");
		expect(media).not.toContain("tailwind-variants");
	});

	test("families consume the shared recipes", () => {
		expect(source("empty", "empty-title.svelte")).toContain("labelText");

		for (const family of families) {
			expect(familySource(family)).toContain("cn(");
		}
	});
});
