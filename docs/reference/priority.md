# Impact, urgency, and priority

Priority is derived from two independent triage inputs: **impact** (how bad the problem is) and **urgency** (how soon it needs attention). Both are ordinary reserved GitHub labels, each a single value from a three-point scale. There is no free-form score, and priority itself is never a label.

The canonical definitions live in `src/lib/priority.ts`; the matrix there is the single source of truth. This page documents the same rules for triagers.

## Impact

Impact answers “how much does this hurt?”. The label describes the level.

| Label | Value | Name | Definition |
| :--- | :--- | :--- | :--- |
| `sev` | `1` | Severe | Blocks many users or a critical path; no workaround. |
| `mod` | `2` | Moderate | Blocks a team or an important flow; workaround is costly. |
| `min` | `3` | Minor | Degrades a flow or is a single-person annoyance. |

## Urgency

Urgency answers “how soon must this be addressed?” and is independent of impact.

| Label | Value | Name | Definition |
| :--- | :--- | :--- | :--- |
| `high` | `1` | High | Nothing else can proceed; harm accrues immediately. |
| `mid` | `2` | Mid | Active degradation; needs this cycle. |
| `low` | `3` | Low | Can wait a sprint or longer. |

## Rating criteria

Each level is rated with five concrete criteria. Impact weighs the effect on users and the business; urgency weighs the cost of waiting. These are decision aids only — no new stored fields, labels, or columns. The criteria labels are fixed: impact is **Reach**, **Data**, **Money**, **Locations** and **Workaround**; urgency is **Harm**, **Exposure**, **Spread**, **Dependencies** and **Deadline**.

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

## Priority matrix

Read the row as impact and the column as urgency. Higher impact and urgency are lower numbers, so the most severe combination is the top-left cell.

| Impact \ Urgency | `high` | `mid` | `low` |
| :--- | :--- | :--- | :--- |
| `sev` | **P1** | **P1** | P2 |
| `mod` | **P1** | P2 | P3 |
| `min` | P2 | P3 | P3 |

`P1` is the highest priority and `P3` the lowest, named High, Medium and Low. The matrix is monotonic: worsening either axis never improves priority.

## The matrix view

The `/matrix` route renders a 3×3 grid of the nine classified combinations over the same filtered issue stream as the Issues view. The rows are impact and the columns are urgency:

| Impact row / Urgency column | Levels |
| :--- | :--- |
| Impact (rows) | `1` Severe, `2` Moderate, `3` Minor |
| Urgency (columns) | `1` High, `2` Mid, `3` Low |

Each cell shows the derived priority (`P1`, `P2`, or `P3`) and the scoped issue count; counts always come from SQL. The grid is a selection control: selecting a cell lists its issues on the right, and an empty cell still shows its classification and an empty state. Keyboard arrows move between cells; Enter or Space selects.

Above the matrix, the assessment summary separates the two states that the grid cannot represent:

- **Needs assessment** — issues missing an impact and/or urgency. **Review queue** opens a filtered list with inline rating controls.
- **Rated issues** — issues with both axes assigned and therefore classified in a cell.

The page defaults to `state=open`, includes triaged and untriaged issues, and applies search, **All/Mine**, and every filter dimension to the counts, the queue, and the selected cell together. On first load it selects the highest-priority populated cell (ties break by impact, then urgency, descending); after that, `?cell=<impact>-<urgency>` persists the user's choice.

### When an axis is unset

Missing input is treated as “not yet assessed”, not as evidence of severity. The stored `mirror_thread.priority` cache keeps the data-layer rule: a pair with one axis unset derives to **`P3`**, and both axes absent derives to **no priority**. A triager can add the missing label to raise the result.

The matrix view keeps incomplete pairs out of the grid entirely. They appear in the assessment summary and the review queue until both axes exist; the stored priority cache still holds the `P3` fallback. The view never presents an unassessed pair as a classified cell.

## Where the inputs live

Impact and urgency are **reserved GitHub labels**, written and read like status and size:

- `sev`, `mod`, `min` — the impact group.
- `high`, `mid`, `low` — the urgency group.

GitHub is authoritative. The mirror caches the two levels on `mirror_github_issue.impact` and `.urgency` at sync time and computes the P1–P3 value into `mirror_github_issue.priority`. The sync worker keeps at most one label per group and resolves a conflicting set with the issue timeline, the same as any other reserved group.

The Inspector's single **Priority** control opens a popover with one slider per axis (0 = not assessed). Changing a slider writes that axis' label through the normal GitHub-backed issue update; the derived token updates optimistically and reconciles on the next refresh.

### Retired priority labels

`p1`, `p2`, and `p3` are retired. Funnel no longer provisions them and never writes them:

- A retired label that agrees with the derived priority is simply stale and ignored.
- A retired label that disagrees, or more than one retired label, sets `label_conflict` so the cockpit can flag it. The label is never trusted.
- Funnel does not delete the old labels from GitHub. That is a separate, explicit upstream cleanup.

## Per-instance matrix override

The matrix is plain data, not a schema or a label vocabulary. `derivePriority(impact, urgency, rules)` accepts either a complete replacement matrix or a partial `PriorityRules` override:

```ts
import { derivePriority, type PriorityMatrix } from "#lib/priority";

const matrix: PriorityMatrix = {
  1: { 1: "P1", 2: "P1", 3: "P2" },
  2: { 1: "P1", 2: "P2", 3: "P3" },
  3: { 1: "P2", 2: "P3", 3: "P3" },
};

derivePriority(2, 3, { matrix });
derivePriority(2, 3, { fallback: "P2" });
```

An instance-level override can therefore be introduced later by supplying another matrix; the label vocabulary does not change. The canonical values are exported as `DEFAULT_PRIORITY_MATRIX`, `DEFAULT_PRIORITY`, and `DEFAULT_PRIORITY_RULES`. Settings-driven matrix editing is deferred.

## Triaging consistently

1. Set impact from the effect on users and flows, not from who reported it.
2. Set urgency from the cost of waiting, independently of impact.
3. Never choose priority by hand; read the matrix.
4. Leave an axis unlabelled only when it genuinely cannot be assessed yet; the derived value falls back to `P3`.

## Related

- [Reserved labels](./reserved-labels.md)
- [The workflow model](../explanation/workflow-model.md)
- [Triage intake](../how-to/use/triage-intake.md)
- [Design](../DESIGN.md)
