import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
	control,
	focusRing,
	labelText,
	menuItem,
	panel,
	triggerChevron,
	triggerClass
} from "#lib/components/primitives/styles";
import { cn } from "#lib/utils";

const root = join(import.meta.dir, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
};

function grepSource(pattern: string): string {
	const result = Bun.spawnSync(["grep", "-r", pattern, "src"], { cwd: root });
	return result.stdout.toString().trim();
}

describe("primitives conventions", () => {
	test("shadcn tooling is gone", () => {
		const all = { ...pkg.dependencies, ...pkg.devDependencies };
		expect(all["shadcn-svelte"]).toBeUndefined();
		expect(all["tailwind-variants"]).toBeUndefined();
		expect(all["tw-animate-css"]).toBeUndefined();
		expect(all.cn).toBeUndefined();
		expect(existsSync(join(root, "components.json"))).toBe(false);
	});

	test("cn merges conflicting utilities", () => {
		expect(cn("rounded-sm", "rounded-none")).toBe("rounded-none");
		expect(cn("px-2", false, "text-sm")).toBe("px-2 text-sm");
	});

	test("namespace is primitives", () => {
		expect(existsSync(join(root, "src/lib/components/primitives/button/index.ts"))).toBe(true);
		expect(existsSync(join(root, "src/lib/components/ui"))).toBe(false);
	});

	test("no shadcn imports", () => {
		expect(grepSource("#lib/components/ui/")).toBe("");
	});

	test("tailwind-variants is absent from src", () => {
		expect(grepSource("tailwind-variants")).toBe("");
	});

	test("global styles drop the shadcn css", () => {
		const css = readFileSync(join(root, "src/lib/styles/global.css"), "utf8");
		expect(css).not.toContain("shadcn-svelte/tailwind.css");
		expect(css).not.toContain("tw-animate-css");
		expect(css).toContain('@import "tailwindcss"');
		expect(css).toContain("@custom-variant dark");
		expect(css).toContain(".no-scrollbar");
	});

	test("style recipes match the spec", () => {
		expect(focusRing).toBe(
			"outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ring)]"
		);
		for (const token of [
			"h-7",
			"w-full",
			"min-w-0",
			"rounded-xs",
			"border-input",
			"bg-background",
			"px-2",
			"text-sm",
			"placeholder:text-muted-foreground",
			"disabled:cursor-not-allowed",
			"disabled:opacity-60"
		]) {
			expect(control, token).toContain(token);
		}
		expect(control).toContain("focus-visible:outline-2");
		expect(panel).toBe(
			"rounded-lg border border-border bg-popover text-popover-foreground shadow-sm"
		);
		for (const token of [
			"rounded-none",
			"px-2",
			"py-1.5",
			"data-[highlighted]:bg-accent",
			"data-[disabled]:opacity-50"
		]) {
			expect(menuItem, token).toContain(token);
		}
		expect(labelText).toBe("text-xs font-semibold text-muted-foreground");
		expect(triggerChevron).toBe("size-4 shrink-0 text-muted-foreground");

		const base = triggerClass("default");
		for (const token of ["h-7", "rounded-xs", "border", "border-input", "bg-background"]) {
			expect(base, token).toContain(token);
		}
		expect(base).not.toContain("rounded-lg");
		expect(base).toContain("focus-visible:outline-2");
		expect(triggerClass("ghost")).toContain("border-transparent");
		expect(triggerClass("pill")).toContain("bg-muted");

		// A call site can still override a primitive default (spec §3).
		const overridden = triggerClass("default", "rounded-lg w-40");
		expect(overridden).toContain("rounded-lg");
		expect(overridden).not.toContain("rounded-xs");
		expect(overridden).toContain("w-40");
	});
});
