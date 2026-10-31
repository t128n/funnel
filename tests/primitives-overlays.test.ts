import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { labelText, menuItem, panel } from "#lib/components/primitives/styles";

const root = join(import.meta.dir, "..");
const dir = join(root, "src/lib/components/primitives");
const families = ["dialog", "sheet", "popover", "tooltip", "dropdown-menu"] as const;

const read = (file: string) => readFileSync(join(dir, file), "utf8");

const familyFiles = (family: string) =>
	readdirSync(join(dir, family))
		.filter((file) => file.endsWith(".svelte"))
		.map((file) => `${family}/${file}`);

const overlayFiles = families.flatMap(familyFiles);

const contentFiles = [
	"dialog/dialog-content.svelte",
	"sheet/sheet-content.svelte",
	"popover/popover-content.svelte",
	"tooltip/tooltip-content.svelte",
	"dropdown-menu/dropdown-menu-content.svelte"
];

const rootFiles = [
	"dialog/dialog.svelte",
	"sheet/sheet.svelte",
	"popover/popover.svelte",
	"tooltip/tooltip.svelte",
	"dropdown-menu/dropdown-menu.svelte"
];

describe("overlay primitives", () => {
	test("flat panels", () => {
		expect(panel).toContain("rounded-lg");
		expect(panel).toContain("border-border");
		expect(panel).toContain("bg-popover");
		expect(panel).toContain("text-popover-foreground");
		expect(panel).not.toContain("ring");
		expect(panel).not.toContain("animate-");
		expect(panel).not.toContain("blur");

		for (const file of [
			"dialog/dialog-content.svelte",
			"sheet/sheet-content.svelte",
			"popover/popover-content.svelte",
			"dropdown-menu/dropdown-menu-content.svelte"
		]) {
			const source = read(file);
			expect(source).toContain('from "../styles.js"');
			expect(source).toContain("panel");
			expect(source).not.toContain("animate-");
			expect(source).not.toContain("ring-1");
			expect(source).not.toContain("ring-foreground");
			expect(source).not.toContain("rounded-xl");
			expect(source).not.toContain("rounded-md");
			expect(source).not.toContain("backdrop-blur");
		}
	});

	test("flat menu rows", () => {
		expect(menuItem).toContain("rounded-none");
		expect(menuItem).toContain("data-[highlighted]:bg-accent");
		expect(menuItem).toContain("data-[disabled]:opacity-50");

		for (const file of [
			"dropdown-menu/dropdown-menu-item.svelte",
			"dropdown-menu/dropdown-menu-radio-item.svelte"
		]) {
			const source = read(file);
			expect(source).toContain('from "../styles.js"');
			expect(source).toContain("menuItem");
			expect(source).not.toContain("rounded-none");
			expect(source).not.toContain("rounded-md");
			expect(source).not.toContain("focus:bg-accent");
			expect(source).not.toContain("dark:");
		}
	});

	test("destructive menu rows tint their own token", () => {
		const source = read("dropdown-menu/dropdown-menu-item.svelte");
		expect(source).toContain("variant === \"destructive\"");
		expect(source).toContain("text-destructive");
		expect(source).toContain("data-[highlighted]:bg-destructive/10");
		expect(source).toContain("data-[highlighted]:text-destructive");
		expect(source).not.toContain("data-[variant=destructive]:data-[highlighted]");
		expect(source).not.toContain("dark:");
	});

	test("menu labels use the shared label recipe", () => {
		expect(labelText).toBe("text-xs font-semibold text-muted-foreground");

		const source = read("dropdown-menu/dropdown-menu-label.svelte");
		expect(source).toContain("labelText");
		expect(source).toContain('from "../styles.js"');
		expect(source).not.toContain("font-medium");
	});

	test("radio rows keep the check anchor and inset", () => {
		const source = read("dropdown-menu/dropdown-menu-radio-item.svelte");
		expect(source).toContain("relative");
		expect(source).toContain("data-inset:pl-7");
		expect(source).toContain("absolute right-2");
		expect(source).toContain('data-slot="dropdown-menu-radio-item-indicator"');
	});

	test("overlay is a flat scrim", () => {
		for (const file of ["dialog/dialog-overlay.svelte", "sheet/sheet-overlay.svelte"]) {
			const source = read(file);
			expect(source).toContain("bg-black/40");
			expect(source).not.toContain("bg-foreground/25");
			expect(source).not.toContain("backdrop-blur");
			expect(source).not.toContain("animate-");
			expect(source).not.toContain("duration-");
		}
	});

	test("dialog title is a heading", () => {
		const source = read("dialog/dialog-title.svelte");
		expect(source).toContain("text-xl");
		expect(source).toContain("font-semibold");
		expect(source).not.toContain("font-medium");
	});

	test("dialog footer is a rule, not a tinted shell", () => {
		const source = read("dialog/dialog-footer.svelte");
		expect(source).toContain("border-t border-border");
		expect(source).toContain("rounded-b-lg");
		expect(source).not.toContain("bg-muted");
		expect(source).not.toContain("shadow");
	});

	test("sheet keeps its edge and loses motion", () => {
		const source = read("sheet/sheet-content.svelte");
		expect(source).toContain("panel");
		expect(source).toContain("rounded-none");
		expect(source).toContain("data-[side=right]:border-l");
		expect(source).toContain("data-[side=bottom]:border-t");
		expect(source).not.toContain("animate-");
		expect(source).not.toContain("shadow-lg");
		expect(source).not.toContain("duration-");
		expect(source).not.toContain("rounded-xl");
	});

	test("tooltip is inverted and flat", () => {
		const source = read("tooltip/tooltip-content.svelte");
		expect(source).toContain("bg-foreground");
		expect(source).toContain("text-background");
		expect(source).toContain("rounded-lg");
		expect(source).toContain("rounded-xs");
		expect(source).not.toContain("panel");
		expect(source).not.toContain("animate-");
		expect(source).not.toContain("rounded-md");
		expect(source).not.toContain("shadow");
		expect(source).not.toContain("backdrop-blur");
	});

	test("no animation, ring, blur or dark utilities", () => {
		const sources = overlayFiles.map(read).join("\n");
		expect(sources).not.toContain("animate-");
		expect(sources).not.toContain("backdrop-blur");
		expect(sources).not.toContain("dark:");
		expect(sources).not.toContain("ring-1");
		expect(sources).not.toContain("ring-foreground");
		expect(sources).not.toContain("shadow-md");
		expect(sources).not.toContain("shadow-lg");
		expect(sources).not.toContain("duration-");
		expect(sources).not.toContain("data-open:");
		expect(sources).not.toContain("data-closed:");
	});

	test("open state and child composition stay bound", () => {
		for (const file of rootFiles) {
			expect(read(file)).toContain("bind:open");
		}
		for (const file of contentFiles) {
			expect(read(file)).toContain("{...restProps}");
		}
		expect(read("dialog/dialog-content.svelte")).toContain("child({ props })");
		expect(read("dialog/dialog-content.svelte")).toContain("@render children");
		expect(read("tooltip/tooltip-content.svelte")).toContain("<TooltipPrimitive.Arrow>");
		expect(read("tooltip/tooltip-content.svelte")).toContain("child({ props })");
	});

	test("close buttons use the button primitive", () => {
		for (const file of ["dialog/dialog-content.svelte", "sheet/sheet-content.svelte"]) {
			const source = read(file);
			expect(source).toContain('import { Button } from "#lib/components/primitives/button/index.js"');
			expect(source).toContain('variant="ghost"');
			expect(source).toContain('size="icon-sm"');
			expect(source).toContain("sr-only");
			expect(source).toContain("child({ props })");
		}

		const dialog = read("dialog/dialog-content.svelte");
		expect(dialog).toContain("<Dialog.Close");
		expect(dialog).not.toContain("DialogPrimitive.Close");

		const sheet = read("sheet/sheet-content.svelte");
		expect(sheet).toContain("<SheetPrimitive.Close");

		const footer = read("dialog/dialog-footer.svelte");
		expect(footer).toContain("<Dialog.Close>");
		expect(footer).toContain("<Button");
	});

	test("panels keep their bits-ui data attributes", () => {
		for (const file of contentFiles) {
			expect(read(file)).toMatch(/data-slot="[a-z-]+-content"/);
		}
		expect(read("sheet/sheet-content.svelte")).toContain("data-side={side}");
		expect(read("dropdown-menu/dropdown-menu-item.svelte")).toContain("data-inset={inset}");
		expect(read("dropdown-menu/dropdown-menu-item.svelte")).toContain("data-variant={variant}");
		expect(read("dropdown-menu/dropdown-menu-label.svelte")).toContain("data-inset={inset}");
		expect(read("dialog/dialog-overlay.svelte")).toContain('data-slot="dialog-overlay"');
		expect(read("sheet/sheet-overlay.svelte")).toContain('data-slot="sheet-overlay"');
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
