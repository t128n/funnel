/**
 * Guards the priority-matrix documentation against drifting away from the
 * feature contract in `docs/plans/2026-10-28-priority-matrix.spec.md`.
 *
 * The `/matrix` route and grid are documented before the implementation lands,
 * so these checks assert the durable vocabulary — the criteria labels, the 3×3
 * semantics, the assessment queue, and the route/nav surface — rather than any
 * code path. When a documented name changes, the spec must change first and
 * this test follows it.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function read(relative: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../${relative}`, import.meta.url)),
    "utf8",
  );
}

describe("priority matrix documentation", () => {
  test("priority reference documents criteria and the 3x3", () => {
    const text = read("docs/reference/priority.md");
    for (const term of ["Reach", "Data", "Money", "Locations", "Workaround", "Harm", "Exposure", "Spread", "Dependencies", "Deadline", "Needs assessment", "Rated issues", "Review queue", "3×3"]) {
      expect(text).toContain(term);
    }
  });

  test("the matrix route and how-to are indexed", () => {
    expect(read("docs/reference/routes-and-pages.md")).toContain("| `/matrix` |");
    expect(read("docs/reference/routes-and-pages.md")).toContain("/matrix/{owner}/{repo}/{number}");
    expect(read("docs/README.md")).toContain("how-to/use/matrix.md");
    const howTo = read("docs/how-to/use/matrix.md");
    expect(howTo).toContain("This guide shows you how to");
    expect(howTo).toContain("Needs assessment");
  });
});
