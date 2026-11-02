import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const doc = readFileSync(join(root, "docs/DESIGN.md"), "utf8");

describe("DESIGN.md", () => {
  test("documents the t128n palette by role", () => {
    expect(doc).toContain("t128n");
    expect(doc).toContain("--color-canvas");
    expect(doc).toContain("--color-surface");
    expect(doc).toContain("--color-primary");
    expect(doc).toContain("--color-border-subtle");
    expect(doc).toContain("--color-text-primary");
  });

  test("documents the shell and density", () => {
    expect(doc).toContain("3rem dark app bar");
    expect(doc).toContain("15rem");
    expect(doc).toContain("Default");
    expect(doc).toContain("2px primary leading bar");
  });

  test("documents the shared application components", () => {
    expect(doc).toContain("PageHeader");
    expect(doc).toContain("StatusText");
    expect(doc).toContain("PriorityText");
    expect(doc).toContain("InlineStatus");
    expect(doc).toContain("EmptyState");
  });

  test("uses the current vocabulary and no Bugzilla leftovers", () => {
    expect(doc).toContain("issue");
    expect(doc).toContain("P1");
    expect(doc).not.toContain("Bugzilla");
    expect(doc).not.toContain(".bug-table");
    expect(doc).not.toContain("#5e6ad2");
    expect(doc).not.toContain("Linear");
  });
});
