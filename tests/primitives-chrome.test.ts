import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

/** Read one file from the owned chrome families. */
function chrome(file: string): string {
	return readFileSync(join(root, "src/lib/components/primitives", file), "utf8");
}

const sidebarFiles = [
	"sidebar/sidebar.svelte",
	"sidebar/sidebar-content.svelte",
	"sidebar/sidebar-footer.svelte",
	"sidebar/sidebar-group.svelte",
	"sidebar/sidebar-group-content.svelte",
	"sidebar/sidebar-header.svelte",
	"sidebar/sidebar-inset.svelte",
	"sidebar/sidebar-menu-badge.svelte",
	"sidebar/sidebar-menu-button.svelte",
	"sidebar/sidebar-menu-item.svelte",
	"sidebar/sidebar-menu.svelte",
	"sidebar/sidebar-provider.svelte",
	"sidebar/sidebar-rail.svelte",
	"sidebar/sidebar-trigger.svelte",
];

describe("sidebar chrome", () => {
	test("sidebar active rule", () => {
		const source = chrome("sidebar/sidebar-menu-button.svelte");
		// 600 weight in `--primary`, carried by a real 3px left rule.
		expect(source).toContain("--sidebar-primary");
		expect(source).toContain("data-[active=true]:font-semibold");
		expect(source).toContain("data-[active=true]:text-[var(--sidebar-primary)]");
		expect(source).toContain("data-[active=true]:before:bg-[var(--sidebar-primary)]");
		expect(source).toContain("before:w-[3px]");
		expect(source).toContain("before:start-0");
	});

	test("menu button uses a variant map", () => {
		const source = chrome("sidebar/sidebar-menu-button.svelte");
		expect(source).not.toContain("tailwind-variants");
		expect(source).not.toContain("tv(");
		expect(source).toContain("sidebarMenuButtonVariants");
		expect(source).toContain("sidebarMenuButtonSizes");
	});

	test("floating chrome is flat", () => {
		const source = chrome("sidebar/sidebar.svelte");
		expect(source).not.toContain("rounded-lg");
		expect(source).not.toContain("rounded-xl");
		expect(source).not.toContain("shadow-sm");
		expect(source).not.toContain("ring-1");
		expect(source).toContain("group-data-[variant=floating]:border");

		const inset = chrome("sidebar/sidebar-inset.svelte");
		expect(inset).not.toContain("rounded-xl");
		expect(inset).not.toContain("shadow-sm");
	});

	test("cookie, hotkey, rail and mobile sheet stay wired", () => {
		const provider = chrome("sidebar/sidebar-provider.svelte");
		expect(provider).toContain("SIDEBAR_COOKIE_NAME");
		expect(provider).toContain("SIDEBAR_COOKIE_MAX_AGE");
		expect(provider).toContain("document.cookie");
		expect(provider).toContain('appHotkeys["sidebar.toggle"]');
		expect(provider).toContain("createHotkey");
		expect(provider).toContain("Tooltip.Provider");

		expect(chrome("sidebar/sidebar-rail.svelte")).toContain("onclick={sidebar.toggle}");

		const source = chrome("sidebar/sidebar.svelte");
		expect(source).toContain("Sheet.Root");
		expect(source).toContain("Sheet.Content");
		expect(source).toContain("sidebar.setOpenMobile");
		expect(source).toContain("SIDEBAR_WIDTH_MOBILE");
	});

	test("collapsed targets survive", () => {
		const button = chrome("sidebar/sidebar-menu-button.svelte");
		expect(button).toContain("group-data-[collapsible=icon]:size-8");
		expect(button).toContain("group-data-[collapsible=icon]:justify-center");
		expect(button).toContain("group-data-[collapsible=icon]:p-2");

		const source = chrome("sidebar/sidebar.svelte");
		expect(source).toContain("--sidebar-width-icon");
		expect(source).toContain("group-data-[collapsible=icon]:w-(--sidebar-width-icon)");
	});

	test("chrome has no animation classes", () => {
		for (const file of sidebarFiles) {
			const source = chrome(file);
			const animated = /animate-|duration-\d|ease-(linear|in-out)|transition-/.test(source);
			expect({ file, animated }).toEqual({ file, animated: false });
		}
	});
});

describe("toast chrome", () => {
	test("toaster tokens", () => {
		const source = chrome("sonner/sonner.svelte");
		expect(source).toContain('from "svelte-sonner"');
		expect(source).toContain("--color-popover");
		expect(source).toContain("--color-popover-foreground");
		expect(source).toContain("--color-border");
		expect(source).not.toContain("cn-toast");
		expect(source).toContain("toastOptions");
	});

	test("toaster is a flat panel", () => {
		const source = chrome("sonner/sonner.svelte");
		expect(source).toContain("rounded-lg");
		expect(source).not.toMatch(/shadow-(lg|xl|2xl)/);
		expect(source).not.toMatch(/animate-(in|out)/);
	});
});
