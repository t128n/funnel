# Spec — priority matrix and assessment guidance

## 1. Problem

Priority is already derived from impact × urgency, but the product never shows
the relationship. The Inspector's Priority popover edits one axis at a time and
explains only the currently selected level. Every other surface renders a
`P1`–`P3` token, so a triager cannot see where the work sits in the 3×3 grid or
which cells are overfull.

There is a second, sharper problem. A missing axis derives to `P3`, so an issue
assessed `sev` with no urgency is indistinguishable from a genuine `P3` in every
list, filter and group. That hides unassessed work inside the lowest tier.

Finally, the level definitions are one sentence each. They do not say how to
weigh data loss, money, the number of people affected, the number of locations,
or the cost of waiting.

## 2. Required behaviour

1. A new `/matrix` cockpit route renders the impact × urgency grid for the same
   filtered issue stream. It defaults to `state=open` when no state filter is
   supplied, and includes triaged and untriaged issues (status is not a
   requirement).
2. The grid has four rows and four columns: impact `1` Severe, `2` Moderate,
   `3` Minor, then **Not assessed**; urgency `1` High, `2` Mid, `3` Low, then
   **Not assessed**. Order is fixed.
3. A cell whose two axes are both assessed shows the existing derived
   `P1`/`P2`/`P3` (`P1 · High`, `P2 · Medium`, `P3 · Low`). Both axes absent
   shows **No priority**. Exactly one axis present shows **Needs assessment**
   and is never labelled `P3`. The stored `mirror_thread.priority` cache is
   unchanged.
4. Each cell shows its total and up to four preview issues, ordered by priority
   rank then most recently updated. A preview issue links to
   `/matrix/{owner}/{repo}/{number}`, where the standard Inspector docks beside
   the grid.
5. The matrix page has the standard search, All/Mine scope and filter popover
   (repo, state, status, assignee, priority, size, label, milestone). It adds no
   filter keys.
6. The page explains how to rate both axes. A collapsible **How to rate**
   panel shows the five criteria per axis at every level.
7. The Inspector Priority popover shows the selected level's criteria bullets
   beneath its definition, and the unselected state names the criteria to
   consider.
8. Impact and urgency guidance uses concrete criteria: impact = reach, data,
   money, locations, workaround; urgency = harm, exposure, spread, dependencies,
   deadline. These are copy only: no stored assessment fields, no new labels,
   no schema or API change.
9. The `Matrix` workspace nav item sits after Board; the active state follows
   the route. Detail links use the shared `ViewId`/`issuePath` model.
10. Documentation covers the route, the 4×4 semantics, the criteria and the
    partial-assessment rule.

## 3. Fixed decisions

- The 4×4 grid is a view over `mirror_thread.impact`/`.urgency`; the canonical
  `DEFAULT_PRIORITY_MATRIX` and derivation function do not change.
- Partial cells display **Needs assessment**; they are not moved, relabelled or
  rewritten in the mirror. The `P3` fallback remains a data-layer rule.
- `/matrix` shows every open mirrored issue matching the filters, including
  issues without a status label. The Inbox remains the staged-submission queue.
- Four preview issues per cell; counts always come from SQL, never from the
  previews. The grid always returns 16 cells.
- Matrix cells are display-only in this version. Drag-to-retriage, bulk edits
  and cell drill-down filters are deferred.
- Guidance is decision-criteria copy only. Monetary loss, data loss, people
  affected and locations are criteria, not columns.
- The Priority popover remains the only write path for impact and urgency.
- No new HTTP API, SSE feed, migration, table, reserved label or settings key.

### Criteria copy

Impact criteria labels: `Reach`, `Data`, `Money`, `Locations`, `Workaround`.
Urgency criteria labels: `Harm`, `Exposure`, `Spread`, `Dependencies`, `Deadline`.

| Impact | Reach | Data | Money | Locations | Workaround |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Severe | All or most users, or a whole tenant or region. | Irreversible loss, corruption, or exposure. | Material revenue, billing, or contractual loss. | Several sites, regions, or tenants. | None; the critical path is blocked. |
| Moderate | A team, a key customer segment, or one location. | Recoverable loss or a contained exposure. | Bounded, forecastable cost. | One site or region. | Exists, but is costly or slow. |
| Minor | An individual or a small group. | No data loss; presentation or convenience only. | Negligible or no cost. | A single device or an edge case. | Trivial and sustainable. |

| Urgency | Harm | Exposure | Spread | Dependencies | Deadline |
| :--- | :--- | :--- | :--- | :--- | :--- |
| High | Damage accrues now, hour by hour. | Data or money is at risk while it waits. | More people or locations are affected over time. | Other people or teams are blocked. | A regulatory, contractual, or launch deadline is imminent. |
| Mid | Active degradation with a stable ceiling. | Contained data or money exposure. | One location or group; not spreading. | A few people are waiting. | Needs this cycle, not this hour. |
| Low | No ongoing harm. | No data or money at risk. | Stable; affects one location. | Nobody is blocked. | No deadline inside this cycle. |

## 4. Acceptance

- `/matrix` renders 16 cells with correct totals; partial and unassessed cells
  are visually distinct from assessed `P3`.
- The route defaults to open issues and applies every existing filter.
- Each cell lists at most four previews in rank/updated order; clicking one
  opens the Inspector at `/matrix/...`.
- The nav entry and route title render, and `bun run check` passes.
- The Priority popover shows five criteria for the selected level.
- `bun test` passes, including the new domain, query, route, grid and docs
  tests.
- Screenshots exist under `docs/assets/screenshots/` and are used in the PR.

## 5. Docs

- `docs/reference/priority.md` — criteria tables, 4×4 matrix view semantics,
  partial assessment, and the unchanged derivation fallback.
- `docs/reference/routes-and-pages.md` — `/matrix` and its detail route.
- `docs/explanation/workflow-model.md` — Matrix as a fourth read view.
- `docs/how-to/use/matrix.md` — reading the grid, the cells, and the guide.
- `docs/README.md` — index entry for the how-to.

## 6. Delivery

- Seed the screenshot harness with partial and unassessed issues, capture the
  matrix in light and dark plus the open Priority popover, and commit the PNGs
  under `docs/assets/screenshots/`.
- The coordinator opens a PR whose body embeds those images and summarises the
  tests.

## 7. Test contracts

Implement these verbatim; each is named for the task that owns it.

### T1 domain and guidance data

```ts
test("every level carries five decision criteria", () => {
  for (const level of [...IMPACT_SCALE, ...URGENCY_SCALE]) {
    expect(level.criteria).toHaveLength(5);
    for (const criterion of level.criteria) {
      expect(criterion.label.length).toBeGreaterThan(0);
      expect(criterion.anchor.length).toBeGreaterThan(0);
    }
  }
});
test("matrixCellMeta separates assessed, partial and unassessed cells", () => {
  expect(matrixCellMeta(1, 1)).toMatchObject({ priority: "P1", assessment: "both", label: "P1 · High", tone: "p1" });
  expect(matrixCellMeta(2, 3)).toMatchObject({ priority: "P3", assessment: "both", label: "P3 · Low" });
  expect(matrixCellMeta(1, null)).toMatchObject({ priority: null, assessment: "partial", label: "Needs assessment", tone: "partial" });
  expect(matrixCellMeta(null, 2)).toMatchObject({ priority: null, assessment: "partial" });
  expect(matrixCellMeta(null, null)).toMatchObject({ priority: null, assessment: "none", label: "No priority", tone: "none" });
  expect(matrixCellMeta("1", "1")).toMatchObject({ priority: "P1" });
  expect(matrixCellMeta(9, 9)).toMatchObject({ assessment: "none" });
});
test("matrix axes keep the assessed levels then Not assessed", () => {
  expect(MATRIX_IMPACT_VALUES).toEqual([1, 2, 3, null]);
  expect(MATRIX_URGENCY_VALUES).toEqual([1, 2, 3, null]);
  expect(scaleLevel(IMPACT_SCALE, 2)?.name).toBe("Moderate");
  expect(scaleLevel(IMPACT_SCALE, null)).toBeNull();
});
```

### T2 matrix query

```ts
function matrixSeed(): number {
  const repo = seedPlanningRepo("acme/widgets");
  const add = (number: number, impact: number | null, urgency: number | null, extra: Partial<PlanningIssueSeed> = {}) =>
    seedPlanningIssue({ repoId: repo, number, impact, urgency, ...extra });
  add(1, 1, 1); add(2, 1, null); add(3, null, 2); add(4, null, null);
  add(5, 3, 3, { status: "todo" });
  add(6, 2, 2, { state: "closed", stateReason: "completed" });
  return repo;
}
function cell(board: MatrixBoard, impact: number | null, urgency: number | null) {
  return board.cells.find((entry) => entry.impact === impact && entry.urgency === urgency)!;
}
test("matrix counts every axis pair, including unassessed", () => {
  matrixSeed();
  const board = matrixBoard({ ...EMPTY_FILTER, states: ["open"] });
  expect(board.cells).toHaveLength(16);
  expect(cell(board, 1, 1).total).toBe(1);
  expect(cell(board, 1, null).total).toBe(1);
  expect(cell(board, null, 2).total).toBe(1);
  expect(cell(board, null, null).total).toBe(1);
  expect(cell(board, 3, 3).total).toBe(1);
  expect(cell(board, 2, 2).total).toBe(0);
  expect(board.total).toBe(5);
});
test("matrix previews are capped and ordered by rank then updated", () => {
  const repo = seedPlanningRepo("acme/widgets");
  for (let number = 1; number <= 6; number += 1) {
    seedPlanningIssue({ repoId: repo, number, impact: 1, urgency: 1, priority: "P1", updatedAt: number });
  }
  const board = matrixBoard({ ...EMPTY_FILTER, states: ["open"] });
  const found = cell(board, 1, 1);
  expect(found.total).toBe(6);
  expect(found.issues.map((issue) => issue.number)).toEqual([6, 5, 4, 3]);
});
```

### T3 matrix route and grid

```ts
test("lays out four impact rows by four urgency columns", () => {
  const rows = matrixGrid({ total: 0, cells: [] });
  expect(rows).toHaveLength(4);
  expect(rows[0]).toHaveLength(4);
  expect(rows[0][0].meta).toMatchObject({ label: "P1 · High", assessment: "both" });
  expect(rows[0][3].meta).toMatchObject({ label: "Needs assessment", assessment: "partial" });
  expect(rows[3][3].meta).toMatchObject({ label: "No priority", assessment: "none" });
});
test("matrix detail links and the view id are shared", () => {
  expect(issuePath("matrix", "acme/web", 12)).toBe("/matrix/acme/web/12");
  expect(viewOf("/matrix/acme/web/12")).toBe("matrix");
});
test("the matrix load defaults to open issues", async () => {
  matrixSeed();
  const data = await load({ url: new URL("http://x/matrix"), parent: async () => ({ viewerExternalId: null }) } as never);
  expect(data.matrix.cells).toHaveLength(16);
  expect(data.matrix.cells.find((entry) => entry.impact === 1 && entry.urgency === 1)?.total).toBe(1);
  expect(data.matrix.cells.find((entry) => entry.impact === 2 && entry.urgency === 2)?.total).toBe(0);
});
```

### T4 priority popover guidance

```sh
bun run check
bun test src/lib/priority.test.ts
```

### T5 documentation

```ts
test("priority reference documents criteria and the 4x4", () => {
  const text = read("docs/reference/priority.md");
  for (const term of ["Reach", "Data", "Money", "Locations", "Workaround", "Harm", "Exposure", "Spread", "Dependencies", "Deadline", "Needs assessment", "No priority", "4×4"]) {
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
```

### T6 screenshots and seed

```ts
import { statSync } from "node:fs";
test("matrix and guidance screenshots exist", () => {
  for (const path of [
    "docs/assets/screenshots/matrix-light.png",
    "docs/assets/screenshots/matrix-dark.png",
    "docs/assets/screenshots/priority-guidance-light.png",
  ]) {
    expect(statSync(path).size).toBeGreaterThan(1000);
  }
});
```
