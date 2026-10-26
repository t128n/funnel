import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dir, "../src/lib/components/primitives");
const source = (path: string) => readFileSync(join(dir, path), "utf8");

const button = source("button/button.svelte");
const input = source("input/input.svelte");
const textarea = source("textarea/textarea.svelte");
const nativeSelect = source("native-select/native-select.svelte");
const label = source("label/label.svelte");
const kbd = source("kbd/kbd.svelte");
const separator = source("separator/separator.svelte");
const spinner = source("spinner/spinner.svelte");
const styles = source("styles.ts");

describe("control primitives", () => {
	test("button is native", () => {
		expect(button).toContain("rounded-xs");
		expect(button).toContain("bg-primary");
		expect(button).toContain("bg-muted");
		expect(button).not.toContain("rounded-lg");
		expect(button).not.toContain("tailwind-variants");
		expect(button).not.toContain("dark:");
		expect(button).not.toMatch(/\bring-\S/);
		expect(button).not.toMatch(/\bshadow-/);
	});

	test("text controls share recipe", () => {
		expect(styles).toContain("border-input");
		expect(styles).toContain("rounded-xs");
		for (const file of [input, textarea, nativeSelect]) {
			expect(file).toContain("control");
			expect(file).toContain("../styles.js");
			expect(file).not.toContain("rounded-lg");
			expect(file).not.toContain("dark:");
			expect(file).not.toMatch(/\bring-\S/);
		}
		expect(input).toContain("focus-visible:border-input");
		expect(textarea).toContain("focus-visible:border-input");
	});

	test("inline editors are ghost controls", () => {
		expect(input).toContain('"default" | "ghost"');
		expect(input).toContain("border-transparent");
		expect(textarea).toContain('"default" | "ghost"');
		expect(textarea).toContain("border-transparent");
	});

	test("label uses the shared label recipe", () => {
		expect(label).toContain("labelText");
		expect(label).toContain("../styles.js");
		expect(label).not.toContain("dark:");
	});

	test("kbd is mono on muted", () => {
		expect(kbd).toContain("font-mono");
		expect(kbd).toContain("bg-muted");
		expect(kbd).toContain("text-muted-foreground");
		expect(kbd).toContain("border-border");
		expect(kbd).toContain("rounded-xs");
		expect(kbd).not.toContain("rounded-sm");
		expect(kbd).not.toContain("dark:");
	});

	test("separator is a 1px rule", () => {
		expect(separator).toContain("h-px");
		expect(separator).toContain("w-px");
		expect(separator).toContain("data-[orientation=horizontal]");
		expect(separator).toContain("data-[orientation=vertical]");
		expect(separator).not.toContain("data-horizontal");
		expect(separator).not.toContain("dark:");
	});

	test("spinner turns", () => {
		expect(spinner).toContain("size-4");
		expect(spinner).toContain("animate-spin");
		expect(spinner).not.toContain("dark:");
	});

	test("controls keep href and bindable refs", () => {
		expect(button).toContain("<a");
		expect(button).toContain("href");
		expect(button).toContain("bind:this={ref}");
		for (const file of [input, textarea, nativeSelect, label, kbd, separator]) {
			expect(file).toContain("$bindable(null)");
		}
	});
});
