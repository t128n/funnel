import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { matrixGrid } from "#lib/components/matrix/matrix-grid";

describe("matrixGrid", () => {
  test("lays out four impact rows by four urgency columns", () => {
    const rows = matrixGrid({ total: 0, cells: [] });
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveLength(4);
    expect(rows[0][0].meta).toMatchObject({ label: "P1 · High", assessment: "both" });
    expect(rows[0][3].meta).toMatchObject({ label: "Needs assessment", assessment: "partial" });
    expect(rows[3][3].meta).toMatchObject({ label: "No priority", assessment: "none" });
  });

  test("the grid table uses a fixed layout so all five columns fit at 1440", () => {
    // `table-layout: auto` let long issue titles widen the columns and clip the
    // Not assessed column off the right edge; the fixed layout pins a narrow
    // row-header column and gives the four urgency columns equal shares so the
    // whole table stays inside the viewport while titles truncate.
    const source = readFileSync(
      fileURLToPath(new URL("./MatrixGrid.svelte", import.meta.url)),
      "utf8",
    );
    expect(source).toContain("table-layout: fixed");
    expect(source).toContain("<colgroup>");
    expect((source.match(/<col\b/g) ?? []).length).toBe(5);
  });
});
