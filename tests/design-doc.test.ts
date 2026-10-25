import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const doc = readFileSync(join(root, "docs/DESIGN.md"), "utf8");

describe("DESIGN.md", () => {
  test("documents the Bugzilla palette", () => {
    expect(doc).toContain("#0060df");
    expect(doc).toContain("--primary");
    expect(doc).toContain("--comment-reporter");
  });

  test("documents the shared primitives", () => {
    expect(doc).toContain(".bug-table");
    expect(doc).toContain(".bug-meta");
    expect(doc).toContain(".bug-comment");
    expect(doc).toContain(".bug-chrome");
    expect(doc).toContain(".flag");
    expect(doc).toContain(".link");
  });

  test("uses Bugzilla vocabulary", () => {
    expect(doc).toContain("UNCONFIRMED");
    expect(doc).toContain("P1");
  });

  test("carries no leftovers from the previous palette", () => {
    expect(doc).not.toContain("#5e6ad2");
    expect(doc).not.toContain("Linear");
  });
});
