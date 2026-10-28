import { describe, expect, test } from "bun:test";
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
});
