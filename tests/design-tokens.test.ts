import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const css = readFileSync(join(root, "src/lib/styles/global.css"), "utf8");
const pkg = readFileSync(join(root, "package.json"), "utf8");

/** The body of the first `.dark { ... }` block that declares colour tokens. */
function darkBlock(source: string): string {
  const matches = source.matchAll(/\.dark\s*\{([^}]*)\}/g);
  for (const match of matches) {
    if (match[1]?.includes("--background")) return match[1];
  }
  return "";
}

describe("design tokens", () => {
  test("light palette matches Bugzilla", () => {
    expect(css).toContain("--primary: #0060df");
    expect(css).toContain("--border: #cfcfd8");
    expect(css).toContain("--foreground: #15141a");
    expect(css).toContain("--comment-reporter: #fffbe6");
  });

  test("dark palette defines the same anchors", () => {
    const dark = darkBlock(css);
    expect(dark).toContain("--primary: #8cb4ff");
    expect(dark).toContain("--border: #52525e");
  });

  test("no translucent hairline tokens remain", () => {
    expect(css).not.toMatch(/--surface-(card|border|divider|tag-bg)/);
    expect(css).not.toContain(".surface-shell");
  });

  test("radius is at most 4px", () => {
    expect(css).toContain("--radius: 0.25rem");
  });

  test("Inter is removed", () => {
    expect(pkg).not.toContain("fontsource-variable/inter");
    expect(css).not.toContain("fontsource-variable/inter");
  });

  test("type scale and system font stacks are declared", () => {
    for (const token of [
      "--text-2xs: 0.625rem",
      "--text-xs: 0.6875rem",
      "--text-sm: 0.8125rem",
      "--text-base: 0.875rem",
      "--text-lg: 0.9375rem",
      "--text-xl: 1.0625rem",
      "--text-2xl: 1.25rem",
    ]) {
      expect(css).toContain(token);
    }
    expect(css).toContain("--font-sans: system-ui");
    expect(css).toContain("--font-mono: ui-monospace");
  });

  test("Bugzilla primitives are present", () => {
    expect(css).toContain(".bug-table");
    expect(css).toContain(".bug-meta");
    expect(css).toContain(".bug-comment");
    expect(css).toContain(".bug-chrome");
    expect(css).toContain(".flag");
  });
});
