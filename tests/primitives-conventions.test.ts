import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { cn } from "#lib/utils";

const root = join(import.meta.dir, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
};

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
});
