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
		expect(label).toContain("variant?: FieldLabelVariant");
		expect(labelText).toContain("text-xs");
		expect(labelText).toContain("font-semibold");
		expect(description).toContain("text-xs");
		expect(description).not.toContain("text-sm");
	});

	test("field label choice is a checked card", () => {
		const label = read("field/field-label.svelte");
		const barrel = read("field/index.ts");

		expect(label).toContain('export type FieldLabelVariant = "default" | "choice"');
		expect(barrel).toContain("type FieldLabelVariant");

		// The choice branch is a bordered, 2px-radius, normal-weight option with
		// a pointer, not the 11px/600 muted prompt.
		const choice = label.match(/choice: cn\(([\s\S]*?)\n\t\t\)/)?.[1] ?? "";
		expect(choice).toContain("cursor-pointer");
		expect(choice).toContain("rounded-xs");
		expect(choice).toContain("border border-input");
		expect(choice).toContain("text-sm font-normal text-foreground");
		expect(choice).not.toContain("labelText");
		expect(choice).not.toContain("font-semibold");

		// Checked affordance for bits-ui data-state and native radios.
		for (const state of ["has-data-[state=checked]", "has-[:checked]"]) {
			expect(label).toContain(`${state}:border-primary`);
			expect(label).toContain(`${state}:bg-accent`);
		}
	});

	test("choice labels do not depend on self state or data-checked", () => {
		const label = read("field/field-label.svelte");
		expect(label).not.toContain("has-data-checked:");
		expect(label).not.toContain(" data-[state=checked]:");
	});

	test("child snippets forward refs through attachments", () => {
		expect(read("item/item.svelte")).toContain("createAttachmentKey");
		expect(read("bubble/bubble-content.svelte")).toContain("createAttachmentKey");
	});

	test("bubbles flat", () => {
		const bubble = read("bubble/bubble.svelte");
		const content = read("bubble/bubble-content.svelte");

		// The box is the content slot: one 1px edge on a token surface.
		expect(content).toContain("border-border");
		expect(content).toContain("bg-card");
		expect(content).not.toContain("bg-primary");
		expect(content).not.toContain("text-primary-foreground");

		// Only the two flat variants survive.
		expect(bubble).toContain('export type BubbleVariant = "default" | "muted"');
		expect(bubble).not.toContain("secondary");
		expect(bubble).not.toContain("tinted");
		expect(bubble).not.toContain("ghost");
	});

	test("field errors and disabled states pass through", () => {
		const field = read("field/field.svelte");
		const label = read("field/field-label.svelte");
		const group = read("field/field-group.svelte");

		expect(field).toContain("data-[invalid=true]:text-destructive");
		expect(label).toContain("group-data-[disabled=true]/field:pointer-events-none");
		expect(label).toContain("group-data-[disabled=true]/field:opacity-50");
		expect(group).toContain("@container/field-group");
		expect(group).toContain("gap-4");
	});

	test("input group is one control shell", () => {
		const root = read("input-group/input-group.svelte");
		const input = read("input-group/input-group-input.svelte");
		const textarea = read("input-group/input-group-textarea.svelte");
		const addon = read("input-group/input-group-addon.svelte");

		expect(root).toContain("border-input");
		expect(root).toContain("rounded-xs");
		expect(root).toContain("has-[[data-slot][aria-invalid=true]]:border-destructive");
		expect(root).toContain("has-[textarea]:h-auto");
		expect(input).toContain('variant="ghost"');
		expect(input).toContain("border-transparent");
		expect(textarea).toContain('variant="ghost"');
		expect(textarea).toContain("border-transparent");
		// The addon is flat: no fill or edge of its own.
		expect(addon).toContain('order-first');
		expect(addon).toContain('order-last');
		expect(addon).not.toContain("bg-muted");
		expect(addon).not.toContain("border-input");
	});

	test("avatars stay round", () => {
		const root = read("avatar/avatar.svelte");
		const fallback = read("avatar/avatar-fallback.svelte");
		const image = read("avatar/avatar-image.svelte");

		expect(root).toContain("rounded-full");
		expect(root).toContain("loadingStatus");
		expect(fallback).toContain("rounded-full");
		expect(fallback).toContain("text-xs");
		// 10px is reserved for counts; initials stay on the 11px floor.
		expect(fallback).not.toContain("text-2xs");
		expect(image).toContain("rounded-full");
		expect(image).toContain("object-cover");
	});

	test("message and bubble align by data attribute", () => {
		const message = read("message/message.svelte");
		const content = read("message/message-content.svelte");
		const bubble = read("bubble/bubble.svelte");

		expect(message).toContain("data-align={align}");
		expect(message).toContain("data-[align=end]:flex-row-reverse");
		expect(content).toContain("group-data-[align=end]/message");
		expect(bubble).toContain("data-align={align}");
		expect(bubble).toContain("data-[align=end]:self-end");
		expect(bubble).toContain('data-slot="bubble"');
	});

	test("code block is mono with a working copy", () => {
		const content = read("code-block/code-block-content.svelte");
		const root = read("code-block/code-block.svelte");
		const copy = read("code-block/code-block-copy-button.svelte");

		expect(root).toContain("text-sm");
		expect(content).toContain("font-mono");
		expect(content).toContain("text-sm");
		expect(copy).toContain("navigator.clipboard");
		// Outside a secure context the clipboard API is missing; the button
		// must stay inert instead of throwing on click.
		expect(copy).toContain("navigator.clipboard?.writeText");
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

	test("variant helpers keep their full class set", () => {
		const bubble = read("bubble/bubble.svelte");
		const block = read("code-block/code-block.svelte");
		const line = read("code-block/code-block-line.svelte");

		// Barrel callers pass `{ variant }` and get geometry plus surface back,
		// exactly like `buttonVariants` and `sidebarMenuButtonVariants`.
		expect(bubble).toMatch(/export function bubbleVariants\(\{\s*variant = "default"\s*\}/);
		expect(bubble).toMatch(
			/return cn\([\s\S]*?group\/bubble[\s\S]*?bubbleSurface\[variant\]/
		);
		expect(bubble).toContain("cn(bubbleVariants({ variant }), className)");

		expect(block).toMatch(/export function codeBlockVariants\(\{\s*variant = "default"\s*\}/);
		expect(block).toMatch(
			/return cn\([\s\S]*?group\/code-block[\s\S]*?codeBlockSurface\[variant\]/
		);
		expect(block).toContain("cn(codeBlockVariants({ variant }), className)");

		expect(line).toMatch(
			/export function codeBlockLineVariants\(\{\s*variant = "default"\s*\}/
		);
		expect(line).toMatch(/return cn\([\s\S]*?min-h-\[1lh\][\s\S]*?lineSurface\[variant\]/);
		expect(line).toContain("cn(codeBlockLineVariants({ variant }), className)");
	});

	test("no shadcn chrome in forms and content", () => {
		for (const { path, source } of familySources()) {
			expect(source, path).not.toContain("tailwind-variants");
			expect(source, path).not.toContain("dark:");
			expect(source, path).not.toContain("rounded-lg");
			expect(source, path).not.toContain("shadow-");
			expect(source, path).not.toMatch(/(?:^|[\s"':])ring-/);
		}
	});
});
