/**
 * `/matrix` layout load (SPEC §2, §7 T3): the route projects the filtered
 * stream onto 16 counted cells and defaults to open issues. The load is
 * exercised with the same `url`/`parent` shape SvelteKit passes, against the
 * shared in-memory DB; the mirror is cleared and the config reset per case so
 * the axis counts are deterministic.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { setConfig } from "#/lib/server/config";
import type { MatrixBoard } from "#/lib/server/issues/types";
import { load } from "#/routes/(app)/matrix/+layout.server";
import { clearMirror } from "#tests/mirror-helpers";
import {
  seedPlanningIssue,
  seedPlanningRepo,
  type PlanningIssueSeed,
} from "#tests/planning-helpers";
import { TEST_CONFIG } from "#tests/test-config";

/** Five open issues across the axis pairs plus one closed (excluded by default). */
function matrixSeed(): number {
  const repo = seedPlanningRepo("acme/widgets");
  const add = (
    number: number,
    impact: number | null,
    urgency: number | null,
    extra: Partial<PlanningIssueSeed> = {},
  ) => seedPlanningIssue({ repoId: repo, number, impact, urgency, ...extra });
  add(1, 1, 1);
  add(2, 1, null);
  add(3, null, 2);
  add(4, null, null);
  add(5, 3, 3, { status: "todo" });
  add(6, 2, 2, { state: "closed", stateReason: "completed" });
  return repo;
}

function cell(
  board: MatrixBoard,
  impact: number | null,
  urgency: number | null,
) {
  return board.cells.find(
    (entry) => entry.impact === impact && entry.urgency === urgency,
  )!;
}

beforeEach(() => {
  setConfig(TEST_CONFIG);
  clearMirror();
});

describe("matrix route", () => {
  test("the matrix load defaults to open issues", async () => {
    matrixSeed();
    const data = await load({
      url: new URL("http://x/matrix"),
      parent: async () => ({ viewerExternalId: null }),
    } as never);
    expect(data.matrix.cells).toHaveLength(16);
    expect(cell(data.matrix, 1, 1).total).toBe(1);
    expect(cell(data.matrix, 2, 2).total).toBe(0);
  });
});
