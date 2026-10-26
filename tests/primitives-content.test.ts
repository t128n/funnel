import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { labelText } from "#lib/components/primitives/styles";

const primitives = join(import.meta.dir, "..", "src", "lib", "components", "primitives");

const read = (path: string) => readFileSync(join(primitives, path), "utf8");

const families = [
	"field",
	"input-group",
	"avatar",
	"message",
	"bubble",
	"code-block",
	"collapsible"
] as const;

function familySources(): Array<{ path: string; source: string }> {
	return families.flatMap((family) =>
		readdirSync(join(primitives, family))
			.filter((file) => file.endsWith(".svelte") || file.endsWith(".ts"))
			.map((file) => ({
				path: `${family}/${file}`,
				source: read(`${family}/${file}`)
			}))
	);
}

describe("forms and content primitives", () => {
	test("field labels", () => {
		const label = read("field/field-label.svelte");
		const description = read("field/field-description.svelte");

		expect(label).toContain("labelText");
		expect(labelText).toContain("text-xs");
		expect(labelText).toContain("font-semibold");
		expect(description).toContain("text-xs");
		expect(description).not.toContain("text-sm");
	});

	test("bubbles flat", () => {
		const bubble = read("bubble/bubble.svelte");
		const content = read("bubble/bubble-content.svelte");

		expect(content).toContain("border-border");
		expect(bubble).not.toContain("bg-primary");
		expect(bubble).toContain('"muted"');
		expect(bubble).not.toContain("secondary");
	});

	test("field errors and disabled states pass through", () => {
		const field = read("field/field.svelte");
		const label = read("field/field-label.svelte");
		const group = read("field/field-group.svelte");

		expect(field).toContain("data-[invalid=true]:text-destructive");
		expect(label).toContain("disabled");
		expect(group).toContain("group/field-group");
	});

	test("input group is one control shell", () => {
		const root = read("input-group/input-group.svelte");
		const input = read("input-group/input-group-input.svelte");
		const textarea = read("input-group/input-group-textarea.svelte");
		const addon = read("input-group/input-group-addon.svelte");

		expect(root).toContain("border-input");
		expect(root).toContain("rounded-xs");
		expect(root).toContain("aria-invalid");
		expect(root).toContain("has-[textarea]:h-auto");
		expect(input).toContain('variant="ghost"');
		expect(textarea).toContain('variant="ghost"');
		expect(addon).toContain('order-first');
		expect(addon).toContain('order-last');
	});

	test("avatars stay round", () => {
		const root = read("avatar/avatar.svelte");
		const fallback = read("avatar/avatar-fallback.svelte");
		const image = read("avatar/avatar-image.svelte");

		expect(root).toContain("rounded-full");
		expect(root).toContain("loadingStatus");
		expect(fallback).toContain("rounded-full");
		expect(image).toContain("rounded-full");
		expect(image).toContain("object-cover");
	});

	test("message and bubble align by data attribute", () => {
		const message = read("message/message.svelte");
		const content = read("message/message-content.svelte");
		const bubble = read("bubble/bubble.svelte");

		expect(message).toContain("data-align={align}");
		expect(message).toContain("data-[align=end]:flex-row-reverse");
		expect(content).toContain("data-slot=\"message-content\"");
		expect(bubble).toContain("data-slot=\"bubble\"");
	});

	test("code block is mono with a working copy", () => {
		const content = read("code-block/code-block-content.svelte");
		const root = read("code-block/code-block.svelte");
		const copy = read("code-block/code-block-copy-button.svelte");

		expect(root).toContain("text-sm");
		expect(content).toContain("font-mono");
		expect(content).toContain("text-sm");
		expect(copy).toContain("navigator.clipboard");
		expect(copy).toContain("aria-live");
		expect(copy).toContain("data-copied");
	});

	test("collapsible keeps its bindings", () => {
		const root = read("collapsible/collapsible.svelte");
		const content = read("collapsible/collapsible-content.svelte");
		const trigger = read("collapsible/collapsible-trigger.svelte");

		expect(root).toContain("bind:open");
		expect(root).toContain("bind:ref");
		expect(content).toContain("CollapsiblePrimitive.Content");
		expect(trigger).toContain("CollapsiblePrimitive.Trigger");
		expect(root).not.toContain("class=");
		expect(content).not.toContain("class=");
	});

	test("no shadcn chrome in forms and content", () => {
		for (const { path, source } of familySources()) {
			expect(source, path).not.toContain("tailwind-variants");
			expect(source, path).not.toContain("dark:");
			expect(source, path).not.toContain("rounded-lg");
			expect(source, path).not.toContain("shadow-");
		}
	});
});
