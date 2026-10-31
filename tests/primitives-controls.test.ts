import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const dir = join(root, "src/lib/components/primitives");
const source = (path: string) => readFileSync(join(dir, path), "utf8");
const read = (path: string) => readFileSync(join(root, path), "utf8");

/** Recursively collect `.svelte` files under a repo-relative directory. */
function svelteFilesUnder(relative: string): string[] {
	const absolute = join(root, relative);
	const files: string[] = [];
	for (const entry of readdirSync(absolute)) {
		const path = join(absolute, entry);
		if (statSync(path).isDirectory()) {
			files.push(...svelteFilesUnder(join(relative, entry)));
		} else if (entry.endsWith(".svelte")) {
			files.push(join(relative, entry));
		}
	}
	return files;
}

/** Read the object literal assigned to `const <name> = { ... } as const`. */
function entries(sourceText: string, name: string): Record<string, string> {
	const start = sourceText.indexOf(`const ${name} = {`);
	const end = sourceText.indexOf("} as const", start);
	const map: Record<string, string> = {};
	for (const match of sourceText
		.slice(start, end)
		.matchAll(/"([^"]+)"\s*:\s*"([^"]*)"|([\w-]+)\s*:\s*"([^"]*)"/g)) {
		map[match[1] ?? match[3]] = match[2] ?? match[4];
	}
	return map;
}

/** Read the multiline `const <name> = ... );` statement. */
function statement(sourceText: string, name: string): string {
	const start = sourceText.indexOf(`const ${name} =`);
	if (start < 0) return "";
	const end = sourceText.indexOf(");", start);
	return sourceText.slice(start, end < 0 ? undefined : end + 2);
}

const button = source("button/button.svelte");
const input = source("input/input.svelte");
const textarea = source("textarea/textarea.svelte");
const nativeSelect = source("native-select/native-select.svelte");
const label = source("label/label.svelte");
const kbd = source("kbd/kbd.svelte");
const separator = source("separator/separator.svelte");
const spinner = source("spinner/spinner.svelte");
const styles = source("styles.ts");

const families: Record<string, string> = {
	button,
	input,
	textarea,
	nativeSelect,
	label,
	kbd,
	separator,
	spinner,
};

describe("control primitives", () => {
	test("button is native", () => {
		const surface = entries(button, "buttonSurface");
		const sizes = entries(button, "buttonSize");

		// One `--primary` action, every quiet action on `--muted`.
		expect(surface.default).toContain("bg-primary");
		expect(surface.default).toContain("text-primary-foreground");
		expect(surface.outline).toContain("bg-muted");
		expect(surface.secondary).toContain("bg-muted");
		expect(surface.secondary).not.toContain("bg-secondary");
		expect(surface.secondary).not.toContain("text-secondary-foreground");
		expect(surface.ghost).toContain("bg-transparent");

		// 2px control radius, never the 4px panel radius.
		expect(button).toContain("rounded-xs");
		expect(button).not.toContain("rounded-lg");
		expect(button).not.toContain("tailwind-variants");

		// The six compact/icon sizes plus the default.
		expect(Object.keys(sizes).sort()).toEqual(
			["default", "sm", "xs", "lg", "icon", "icon-sm", "icon-xs"].sort()
		);
		expect(sizes.default).toContain("h-7");
		expect(sizes.lg).toContain("h-8");
		expect(sizes.icon).toBe("size-7");
		expect(sizes["icon-sm"]).toBe("size-6");
		expect(sizes["icon-xs"]).toBe("size-5");

		// Dropped variants stay dropped.
		expect(button).not.toContain("icon-lg");
		expect(button).not.toMatch(/\blink:/);

		expect(button).not.toContain("dark:");
		expect(button).not.toMatch(/\bring-\S/);
		expect(button).not.toMatch(/\bshadow-/);
	});

	test("text controls share recipe", () => {
		expect(styles).toContain("border-input");
		expect(styles).toContain("rounded-xs");
		expect(styles).toContain("h-7");
		expect(styles).toContain("focus-visible:outline-[var(--ring)]");

		for (const file of [input, textarea, nativeSelect]) {
			expect(file).toContain("control");
			expect(file).toContain("../styles.js");
			expect(file).not.toContain("rounded-lg");
		}

		// Native select keeps the flat 28px/24px control heights.
		expect(nativeSelect).toContain("appearance-none");
		expect(nativeSelect).toContain('"appearance-none pr-7"');
		expect(nativeSelect).toContain('compact && "h-6 pr-6 text-xs"');

		// No primitive in this family carries a ring, shadow, panel radius or
		// dark override.
		const violations = Object.entries(families).flatMap(([name, file]) =>
			[
				/\bring-\S/.test(file) ? `${name}: ring` : null,
				/\bshadow-/.test(file) ? `${name}: shadow` : null,
				file.includes("rounded-lg") ? `${name}: rounded-lg` : null,
				file.includes("dark:") ? `${name}: dark:` : null,
			].filter((violation) => violation !== null)
		);
		expect(violations).toEqual([]);
	});

	test("inline editors are ghost controls", () => {
		const inputGhost = statement(input, "ghostControl");
		const textareaGhost = statement(textarea, "ghostControl");

		expect(input).toContain('"default" | "ghost"');
		expect(textarea).toContain('"default" | "ghost"');

		// Ghost composes `control` instead of re-declaring the geometry.
		for (const ghost of [inputGhost, textareaGhost]) {
			expect(ghost).toContain("merge(");
			expect(ghost).toContain("control");
			expect(ghost).not.toContain("rounded-xs");
			expect(ghost).not.toContain("text-sm");
			expect(ghost).not.toContain("transition-colors");
			expect(ghost).not.toContain("disabled:");
			// No visible border or fill at rest; the edge returns on hover and focus.
			expect(ghost).toContain("border-transparent bg-transparent");
			expect(ghost).toContain("hover:border-border");
			expect(ghost).toContain("focus-visible:border-input");
		}

		// The ghost textarea still grows and keeps its padding.
		expect(textareaGhost).toContain("h-auto min-h-16 field-sizing-content");
		expect(textareaGhost).toContain("px-1 py-1");
	});

	test("label uses the shared label recipe", () => {
		expect(styles).toContain(
			'labelText = "text-xs font-semibold text-muted-foreground"'
		);
		expect(label).toContain("labelText");
		expect(label).toContain("../styles.js");
		expect(label).not.toContain("dark:");
		expect(label).not.toContain("text-sm");
	});

	test("kbd is mono on muted", () => {
		expect(kbd).toContain("font-mono");
		expect(kbd).toContain("bg-muted");
		expect(kbd).toContain("text-muted-foreground");
		expect(kbd).toContain("border-border");
		expect(kbd).toContain("rounded-xs");
		expect(kbd).not.toContain("rounded-sm");
		expect(kbd).not.toContain("font-sans");
		expect(kbd).not.toContain("dark:");
	});

	test("separator is a 1px rule", () => {
		expect(separator).toContain("bg-border");
		expect(separator).toContain("h-px");
		expect(separator).toContain("w-px");
		expect(separator).toContain("data-[orientation=horizontal]");
		expect(separator).toContain("data-[orientation=vertical]");
		expect(separator).not.toContain("data-horizontal");
		expect(separator).not.toContain("dark:");
	});

	test("spinner turns", () => {
		expect(spinner).toContain('"size-4 animate-spin"');
		expect(spinner).toContain("size-4");
		expect(spinner).toContain("animate-spin");
		expect(spinner).not.toContain("dark:");
	});

	test("controls keep href and bindable refs", () => {
		expect(button).toContain("<a");
		expect(button).toContain("href={disabled ? undefined : href}");
		expect(button).toContain("aria-disabled={disabled}");
		expect(button).toContain("bind:this={ref}");
		for (const file of [input, textarea, nativeSelect, label, kbd, separator]) {
			expect(file).toContain("$bindable(null)");
		}

		// The dropped `link` variant and `icon-lg` size have no call sites left.
		const callSites = ["src/lib/components", "src/routes"]
			.flatMap((path) => svelteFilesUnder(path))
			.map(read)
			.join("\n");
		expect(callSites).not.toMatch(/size=["']icon-lg["']/);
		expect(callSites).not.toMatch(/(?:<Button[^>]*\svariant|buttonVariants\(\{[^}]*variant)=["']link["']/);
	});

	test("file inputs never bind value", () => {
		const fileSource = source("input/input.svelte");
		const fileBranch = fileSource.split('{#if type === "file"}')[1]?.split("{:else}")[0] ?? "";
		expect(fileBranch).toContain("bind:files");
		expect(fileBranch).not.toContain("bind:value");
	});
});
