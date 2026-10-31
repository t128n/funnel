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
		expect(source).toContain("createAttachmentKey");
		expect(source).toContain("data-[active=true]:font-semibold");
		expect(source).toContain("data-[active=true]:text-[var(--sidebar-primary)]");
		expect(source).toContain("data-[active=true]:before:bg-[var(--sidebar-primary)]");
		expect(source).toContain("before:w-[3px]");
		expect(source).toContain("before:start-0");
		// The selector must key off the same attribute the row emits, or the
		// rule silently dies while every class string above still matches.
		expect(source).toContain('"data-active": isActive');
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
		expect(source).not.toMatch(/shadow-(?:md|lg|xl|2xl)/);
		expect(source).not.toMatch(/\bring-\d/);
		expect(source).toContain("group-data-[variant=floating]:border");

		const inset = chrome("sidebar/sidebar-inset.svelte");
		expect(inset).not.toContain("rounded-xl");
		expect(inset).not.toContain("shadow-sm");
	});

	test("static sidebar keeps a side-aware edge", () => {
		const source = chrome("sidebar/sidebar.svelte");
		// The `collapsible="none"` branch has no `group-data-[side]` ancestor of
		// its own, so it must read the `side` prop: a right-hand static sidebar
		// would otherwise paint its edge against the viewport.
		expect(source).toContain('side === "right" ? "border-s" : "border-e"');
		expect(source).toContain("border-sidebar-border");
	});

	test("sidebar context and barrels stay stable", () => {
		const index = chrome("sidebar/index.ts");
		expect(index).toContain("useSidebar");
		expect(index).toContain("Root as Sidebar");
		expect(index).toContain("MenuButton as SidebarMenuButton");

		const context = chrome("sidebar/context.svelte.ts");
		expect(context).not.toContain("scn-sidebar");
		expect(context).toContain('const SYMBOL_KEY = "funnel-sidebar"');
		const keys = context.match(/Symbol\.for\(SYMBOL_KEY\)/g) ?? [];
		expect(keys).toHaveLength(2);

		const constants = chrome("sidebar/constants.ts");
		expect(constants).toContain('SIDEBAR_COOKIE_NAME = "sidebar_state"');
		expect(constants).toContain('SIDEBAR_WIDTH = "16rem"');
		expect(constants).toContain('SIDEBAR_WIDTH_ICON = "3rem"');
		expect(constants).toContain('SIDEBAR_WIDTH_MOBILE = "18rem"');

		// A real consumer proves the context key and barrel line up at runtime.
		const nav = readFileSync(join(root, "src/lib/components/nav/nav-section.svelte"), "utf8");
		expect(nav).toContain("Sidebar.useSidebar()");
	});

	test("cookie, hotkey, rail and mobile sheet stay wired", () => {
		const provider = chrome("sidebar/sidebar-provider.svelte");
		expect(provider).toContain("SIDEBAR_COOKIE_NAME");
		expect(provider).toContain("SIDEBAR_COOKIE_MAX_AGE");
		expect(provider).toContain("document.cookie");
		expect(provider).toContain("path=/; max-age=");
		expect(provider).toContain('appHotkeys["sidebar.toggle"]');
		expect(provider).toContain("createHotkey");
		expect(provider).toContain("() => sidebar.toggle()");
		expect(provider).toContain("Tooltip.Provider");

		expect(chrome("sidebar/sidebar-rail.svelte")).toContain("onclick={sidebar.toggle}");

		const source = chrome("sidebar/sidebar.svelte");
		expect(source).toContain("Sheet.Root");
		expect(source).toContain("Sheet.Content");
		expect(source).toContain("bind:open=");
		expect(source).toContain("sidebar.setOpenMobile");
		expect(source).toContain("SIDEBAR_WIDTH_MOBILE");
		expect(source).toContain("{side}");
	});

	test("collapsed targets survive", () => {
		const button = chrome("sidebar/sidebar-menu-button.svelte");
		expect(button).toContain("group-data-[collapsible=icon]:size-8");
		expect(button).toContain("group-data-[collapsible=icon]:justify-center");
		expect(button).toContain("group-data-[collapsible=icon]:p-2");
		// A transparent layout border would leave 14px for a 16px glyph inside
		// the 32px target; only the outline variant may paint an edge.
		expect(button).not.toContain("border border-transparent");
		expect(button).toMatch(/outline:\s*"border border-sidebar-border/);
		expect(button).toContain("group-data-[collapsible=icon]:border-0");

		const source = chrome("sidebar/sidebar.svelte");
		expect(source).toContain("--sidebar-width-icon");
		expect(source).toContain("group-data-[collapsible=icon]:w-(--sidebar-width-icon)");
	});

	test("chrome has no animation classes", () => {
		for (const file of sidebarFiles) {
			const source = chrome(file);
			const animated = /\banimate-|\btransition\b|\btransition-|\bduration-\d|\bease-/.test(source);
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
		expect(source).toContain("--border-radius: var(--radius-lg)");
		expect(source).toContain("theme={$resolvedTheme}");
		expect(source).not.toContain("cn-toast");
		expect(source).toContain("toastOptions");
	});

	test("toaster is a flat panel", () => {
		const source = chrome("sonner/sonner.svelte");
		expect(source).toContain("rounded-lg");
		expect(source).toContain("border-border");
		expect(source).toContain("bg-popover");
		// svelte-sonner hard-codes `#3f3f3f` on `[data-description]`; the
		// important suffix is what actually puts it on the muted token.
		expect(source).toContain("text-muted-foreground!");
		expect(source).not.toMatch(/shadow-(?:md|lg|xl|2xl)/);

		const toastOptions = source.slice(
			source.indexOf("toastOptions"),
			source.indexOf("{...restProps}")
		);
		expect(toastOptions).not.toMatch(/\banimate-|\btransition-/);
	});
});
