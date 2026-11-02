import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const tokens = readFileSync(join(root, "src/lib/styles/tokens.css"), "utf8");
const global = readFileSync(join(root, "src/lib/styles/global.css"), "utf8");
const theme = readFileSync(join(root, "src/lib/styles/theme.css"), "utf8");
const pkg = readFileSync(join(root, "package.json"), "utf8");

/** The body of the `[data-theme="dark"]` block. */
function darkBlock(source: string): string {
  const match = /\[data-theme="dark"\]\s*\{([^}]*)\}/.exec(source);
  return match?.[1] ?? "";
}

describe("t128n design tokens", () => {
  test("light palette matches t128n", () => {
    expect(tokens).toContain("--color-canvas: #ffffff");
    expect(tokens).toContain("--color-primary: #0f62fe");
    expect(tokens).toContain("--color-border-subtle: #dde1e6");
    expect(tokens).toContain("--color-text-primary: #161616");
    expect(tokens).toContain("--color-app-bar: #161616");
    expect(tokens).toContain("--color-selection:");
  });

  test("dark palette defines the same anchors", () => {
    const dark = darkBlock(tokens);
    expect(dark).toContain("--color-canvas: #161616");
    expect(dark).toContain("--color-primary: #33b1ff");
    expect(dark).toContain("--color-border-subtle: #393939");
    expect(dark).toContain("--color-text-primary: #f2f4f8");
  });

  test("the theme bridge maps shadcn roles onto tokens", () => {
    expect(theme).toContain("--background: var(--color-canvas)");
    expect(theme).toContain("--foreground: var(--color-text-primary)");
    expect(theme).toContain("--primary: var(--color-primary)");
    expect(theme).toContain("--border: var(--color-border-subtle)");
    expect(theme).toContain("--accent: var(--color-surface-2)");
    expect(theme).toContain("--destructive: var(--color-error)");
  });

  test("the type floor and control scale are tokenized", () => {
    expect(tokens).toContain("--font-size-caption: 0.75rem");
    expect(tokens).toContain("--font-size-body: 0.875rem");
    expect(tokens).toContain("--font-size-body-content: 1rem");
    expect(tokens).toContain("--font-size-heading-md: 1.5rem");
    expect(tokens).toContain("--size-control-sm: 1.75rem");
    expect(tokens).toContain("--size-row-compact: 2.25rem");
    expect(tokens).toContain("--layout-sidebar: 15rem");
    expect(tokens).toContain("--layout-app-bar: 3rem");
  });

  test("Geist is self-hosted and the old system stack is gone", () => {
    expect(pkg).toContain("@fontsource-variable/geist");
    expect(pkg).toContain("@fontsource-variable/geist-mono");
    expect(tokens).toContain('--font-sans: "Geist Sans"');
    expect(tokens).toContain('--font-mono: "Geist Mono"');
  });

  test("the Bugzilla component layer is gone", () => {
    for (const legacy of [".bug-table", ".bug-meta", ".bug-comment", ".bug-chrome", ".flag", ".issue-grid"]) {
      expect(global).not.toContain(legacy);
    }
    expect(global).toContain(".data-table");
    expect(global).toContain(".label-value");
    expect(global).toContain(".is-selected-row");
    expect(global).toContain(".status");
  });

  test("dark mode is driven by data-theme, not a hard-coded class", () => {
    expect(global).toContain('[data-theme="dark"]');
    expect(tokens).toContain('[data-theme="dark"]');
  });
});
