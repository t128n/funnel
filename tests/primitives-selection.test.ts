import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const source = (path: string) => readFileSync(join(root, path), "utf8");

const dirs = ["select", "command", "toggle", "toggle-group"] as const;
const family = (name: (typeof dirs)[number]) => `src/lib/components/primitives/${name}`;

const files = (name: (typeof dirs)[number]): string[] =>
	readdirSync(join(root, family(name))).map((file) => join(family(name), file));

/** Every `.svelte` file in `src`, for guards that must hold at call sites. */
function svelteFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return svelteFiles(path);
		return entry.name.endsWith(".svelte") ? [path] : [];
	});
}

describe("selection primitives", () => {
	test("select trigger", () => {
		const trigger = source(`${family("select")}/select-trigger.svelte`);

		// One geometry, delegated to the shared recipe.
		expect(trigger).toContain("triggerClass");
		expect(trigger).toContain("variant");
		expect(trigger).toContain('"default" | "ghost" | "pill"');
		expect(trigger).toContain("triggerChevron");

		// The placeholder state stays muted, so a selected value can be loud.
		expect(trigger).toContain("data-[placeholder]:text-muted-foreground");

		// No shadcn-era chrome or scale.
		expect(trigger).not.toContain("rounded-lg");
		expect(trigger).not.toContain("dark:");
		expect(trigger).not.toContain("ring-3");
		expect(trigger).not.toContain("data-[size=");
		expect(trigger).not.toMatch(/\bsize\s*\??[:=]/);
	});

	test("select trigger has no size call sites", () => {
		for (const file of svelteFiles(join(root, "src"))) {
			expect(readFileSync(file, "utf8")).not.toMatch(/<Select\.Trigger[^>]*\bsize=/);
		}
	});

	test("select content and items are flat", () => {
		const content = source(`${family("select")}/select-content.svelte`);
		const item = source(`${family("select")}/select-item.svelte`);

		expect(content).toContain("panel");
		expect(content).toContain("p-1");
		expect(content).not.toContain("animate-in");
		expect(content).not.toContain("shadow-md");
		expect(content).not.toContain("ring-1");

		// Items keep bits-ui's value and selected state, drawn as one flat row.
		expect(item).toContain("menuItem");
		expect(item).toContain("{value}");
		expect(item).toContain("selected");
		expect(item).toContain("CheckIcon");
		expect(item).not.toContain("rounded-md");
		expect(item).not.toContain("focus:bg-accent");
	});

	test("command input", () => {
		const input = source(`${family("command")}/command-input.svelte`);

		expect(input).toContain("border-0");
		expect(input).toContain("text-sm");
		expect(input).toContain("placeholder:text-muted-foreground");
		expect(input).not.toContain("rounded-lg!");
		expect(input).not.toContain("dark:");

		// The wrapper still owns `ref` and `value`: both stay two-way.
		expect(input).toContain("bind:ref");
		expect(input).toContain("bind:value");
		expect(input).not.toContain("InputGroup");
	});

	test("command items forward onSelect", () => {
		const item = source(`${family("command")}/command-item.svelte`);
		const list = source(`${family("command")}/command-list.svelte`);

		// `onSelect` arrives through restProps; wrapping it would drop the action.
		expect(item).toContain("{...restProps}");
		expect(item).not.toMatch(/onSelect\s*=/);
		expect(item).not.toMatch(/^\s*value,?$/m);
		expect(item).toContain("menuItem");
		expect(item).toContain("group-data-[checked=true]");
		expect(item).toContain("data-[selected]");
		expect(item).not.toContain("rounded-sm");
		expect(item).not.toContain("dark:");

		expect(list).toContain("no-scrollbar");
		expect(list).toContain("max-h-72");
	});

	test("toggle is a flat bordered control", () => {
		const toggle = source(`${family("toggle")}/toggle.svelte`);

		expect(toggle).toContain("data-[state=on]:bg-accent");
		expect(toggle).toContain("rounded-xs");
		expect(toggle).toContain("border-input");
		expect(toggle).toContain("focusRing");
		expect(toggle).not.toContain("tailwind-variants");
		expect(toggle).not.toContain("rounded-lg");
		expect(toggle).not.toContain("dark:");
		expect(toggle).not.toContain("transition-all");
	});

	test("toggle group is one bordered control", () => {
		const group = source(`${family("toggle-group")}/toggle-group.svelte`);
		const item = source(`${family("toggle-group")}/toggle-group-item.svelte`);

		expect(group).toContain("border-input");
		expect(group).toContain("rounded-xs");
		expect(group).not.toContain("rounded-lg");
		expect(group).not.toContain("tailwind-variants");
		expect(group).not.toContain("--radius-md");

		// Items are flat segments split by the group's own 1px rules.
		expect(item).toContain("border-l");
		expect(item).toContain("first:border-l-0");
		expect(item).toContain("data-[state=on]:bg-accent");
		// Only the ends follow the group's 2px radius, so an active segment
		// never paints a square corner over the rounded control.
		expect(item).toContain("group-data-[orientation=horizontal]/toggle-group:first:rounded-l-xs");
		expect(item).toContain("group-data-[orientation=horizontal]/toggle-group:last:rounded-r-xs");
		expect(item).toContain("group-data-[orientation=vertical]/toggle-group:first:rounded-t-xs");
		expect(item).toContain("group-data-[orientation=vertical]/toggle-group:last:rounded-b-xs");
		expect(item).not.toContain("rounded-l-lg");
		expect(item).not.toContain("group-data-[spacing=0]");
		expect(item).not.toContain("tailwind-variants");
	});

	test("no shadcn residue in selection families", () => {
		for (const dir of dirs) {
			for (const file of files(dir)) {
				const text = source(file);
				expect(text).not.toContain("tailwind-variants");
				expect(text).not.toContain("components/ui");
				expect(text).not.toContain("dark:");
				expect(text).not.toContain("rounded-lg");
				expect(text).not.toMatch(/\banimate-(in|out)\b/);
			}
		}
	});
});
