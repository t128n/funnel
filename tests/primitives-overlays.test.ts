import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const read = (file: string) =>
	readFileSync(join(root, "src/lib/components/primitives", file), "utf8");

const contentFiles = [
	"dialog/dialog-content.svelte",
	"sheet/sheet-content.svelte",
	"popover/popover-content.svelte",
	"tooltip/tooltip-content.svelte",
	"dropdown-menu/dropdown-menu-content.svelte"
];

const overlayFiles = [
	"dialog/dialog-content.svelte",
	"dialog/dialog-overlay.svelte",
	"dialog/dialog-description.svelte",
	"dialog/dialog-footer.svelte",
	"dialog/dialog-header.svelte",
	"dialog/dialog-title.svelte",
	"sheet/sheet-content.svelte",
	"sheet/sheet-overlay.svelte",
	"sheet/sheet-title.svelte",
	"popover/popover-content.svelte",
	"popover/popover-trigger.svelte",
	"tooltip/tooltip-content.svelte",
	"dropdown-menu/dropdown-menu-content.svelte",
	"dropdown-menu/dropdown-menu-item.svelte",
	"dropdown-menu/dropdown-menu-label.svelte",
	"dropdown-menu/dropdown-menu-radio-item.svelte",
	"dropdown-menu/dropdown-menu-separator.svelte"
];

describe("overlay primitives", () => {
	test("flat panels", () => {
		for (const file of [
			"dialog/dialog-content.svelte",
			"popover/popover-content.svelte",
			"dropdown-menu/dropdown-menu-content.svelte"
		]) {
			const source = read(file);
			expect(source).toContain("panel");
			expect(source).toContain("rounded-lg");
			expect(source).not.toContain("animate-in");
			expect(source).not.toContain("ring-1");
			expect(source).not.toContain("ring-foreground");
		}
	});

	test("flat menu rows", () => {
		const source = read("dropdown-menu/dropdown-menu-item.svelte");
		expect(source).toContain("menuItem");
		expect(source).toContain("rounded-none");
		expect(source).not.toContain("rounded-md");
		expect(source).not.toContain("focus:bg-accent");
	});

	test("overlay is a flat scrim", () => {
		for (const file of ["dialog/dialog-overlay.svelte", "sheet/sheet-overlay.svelte"]) {
			const source = read(file);
			expect(source).toContain("bg-foreground/25");
			expect(source).not.toContain("bg-black");
			expect(source).not.toContain("backdrop-blur");
			expect(source).not.toContain("animate-");
		}
	});

	test("dialog title is a heading", () => {
		const source = read("dialog/dialog-title.svelte");
		expect(source).toContain("text-xl");
		expect(source).toContain("font-semibold");
	});

	test("sheet keeps its edge and loses motion", () => {
		const source = read("sheet/sheet-content.svelte");
		expect(source).toContain("panel");
		expect(source).toContain("border-border");
		expect(source).toContain("data-[side=right]:border-l");
		expect(source).not.toContain("animate-");
		expect(source).not.toContain("shadow-lg");
		expect(source).not.toContain("duration-");
	});

	test("tooltip is inverted and flat", () => {
		const source = read("tooltip/tooltip-content.svelte");
		expect(source).toContain("bg-foreground");
		expect(source).toContain("text-background");
		expect(source).toContain("rounded-xs");
		expect(source).not.toContain("animate-");
		expect(source).not.toContain("rounded-md");
	});

	test("no animation, ring, blur or dark utilities", () => {
		const sources = overlayFiles.map((file) => read(file)).join("\n");
		expect(sources).not.toContain("animate-");
		expect(sources).not.toContain("backdrop-blur");
		expect(sources).not.toContain("dark:");
		expect(sources).not.toContain("ring-1");
		expect(sources).not.toContain("shadow-md");
		expect(sources).not.toContain("shadow-lg");
	});

	test("open state and child composition stay bound", () => {
		for (const file of [
			"dialog/dialog.svelte",
			"sheet/sheet.svelte",
			"popover/popover.svelte",
			"tooltip/tooltip.svelte",
			"dropdown-menu/dropdown-menu.svelte"
		]) {
			expect(read(file)).toContain("bind:open");
		}
		for (const file of contentFiles) {
			expect(read(file)).toContain("{...restProps}");
		}
		expect(read("dialog/dialog-content.svelte")).toContain("child({ props })");
		expect(read("dialog/dialog-content.svelte")).toContain("@render children");
	});

	test("bits-ui supplies escape, outside-click and focus", () => {
		for (const file of contentFiles) {
			const source = read(file);
			expect(source).toMatch(/Primitive\.Content/);
			expect(source).toContain("bind:ref");
		}
		expect(read("dialog/dialog-content.svelte")).toContain("DialogPrimitive.Content");
		expect(read("popover/popover-content.svelte")).toContain("PopoverPrimitive.Content");
		expect(read("dropdown-menu/dropdown-menu-content.svelte")).toContain(
			"DropdownMenuPrimitive.Content"
		);
	});
});
