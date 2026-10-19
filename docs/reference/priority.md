# Impact, urgency, and priority

Priority is derived from two independent triage inputs: **impact** (how bad the problem is) and **urgency** (how soon it needs attention). Both use a fixed four-point ordinal scale. There is no free-form score.

The canonical definitions live in `src/lib/priority.ts`; the matrix there is the single source of truth. This page documents the same rules for triagers.

## Impact

Impact answers “how much does this hurt?”. Use the lowest number that fits.

| Value | Name | Definition |
| :--- | :--- | :--- |
| `1` | Extensive | Blocks many users or a critical path; no workaround. |
| `2` | Significant | Blocks a team or an important flow; workaround is costly. |
| `3` | Moderate | Degrades a flow; a workaround exists. |
| `4` | Minor | Cosmetic or single-person annoyance. |

## Urgency

Urgency answers “how soon must this be addressed?” and is independent of impact. Use the lowest number that fits.

| Value | Name | Definition |
| :--- | :--- | :--- |
| `1` | Critical | Nothing else can proceed; harm accrues immediately. |
| `2` | High | Active degradation; needs this cycle. |
| `3` | Medium | Can wait a sprint. |
| `4` | Low | Can wait indefinitely. |

## Priority matrix

Read the row as impact and the column as urgency. Higher impact and urgency have lower numbers, so the most severe combination is the top-left cell.

| Impact \ Urgency | `1` Critical | `2` High | `3` Medium | `4` Low |
| :--- | :--- | :--- | :--- | :--- |
| `1` Extensive | **P0** | **P0** | P1 | P2 |
| `2` Significant | **P0** | P1 | P2 | P3 |
| `3` Moderate | P1 | P2 | P3 | P3 |
| `4` Minor | P2 | P3 | P3 | P3 |

`P0` is the highest priority and `P3` the lowest. The matrix is monotonic: worsening either axis never improves priority.

### When an axis is unset

If **one** axis is unset, malformed, or outside `1`–`4`, the derived priority is **`P3`**. Missing input is treated as “not yet assessed”, not as evidence of severity; a triager can set the missing axis to raise the result. This fallback is configurable through `PriorityRules.fallback`, but `P3` is the instance default.

If **both** axes are unset, the issue has *no priority* rather than `P3`: the cockpit renders the empty state so an unassessed issue is visibly distinct from one assessed as low. Clearing both axes persists that empty state, and a later sync will not resurrect a retired label.

## Where the axes live

Impact and urgency are **Funnel-owned durable state**, stored in the
`state_issue_priority` table keyed by `org/name` + issue number — the same
pattern as work notes and attachments. They are not labels and not mirrored
GitHub data, so mirror pruning and a full re-sync cannot lose a triager's
assessment.

Each row stores `impact`, `urgency`, the derived `priority` (`P0`–`P3`, or
`NULL` when both axes are unset), and timestamps. The Inspector writes the axes
through the local `PATCH /api/mirror/issues/{owner}/{repo}/{number}/priority`
endpoint; the server derives and returns the priority. Reads join the state
table, which is why the priority filter, default sort, group-by, and P0 "Urgent"
token all use the same derived value.

### Retired labels and the migration

The `p1`/`p2`/`p3` labels are retired. Funnel no longer writes them, no longer
reads them as the priority value, and no longer provisions them in repositories.

- The migration seeds `state_issue_priority` from the mirrored `p1`–`p3`
  projection so an existing board does not change overnight.
- An issue with no state row is seeded once on first sync: impact/urgency body
  metadata first, then a retired label.
- A retired label that disagrees with the durable value is never trusted. The
  mirror's `labelConflict` flag surfaces it in the cockpit, the same signal used
  for ambiguous reserved-label conflicts.
- The dashboard does not delete the old labels from GitHub. That is a separate,
  explicit upstream cleanup.

### Legacy body metadata

The impact/urgency scale work originally wrote the axes into the issue body's
trailing `<!-- funnel_metadata -->` envelope. Those helpers remain for importing
existing data, but the database is authoritative. A missing state row may be
seeded from the body; subsequent Inspector writes go to the database only.

## Per-instance matrix override

The matrix is plain data, not a schema or a label vocabulary. `derivePriority(impact, urgency, rules)` accepts either a complete replacement matrix or a partial `PriorityRules` override:

```ts
import { derivePriority, type PriorityMatrix } from "#lib/priority";

const matrix: PriorityMatrix = {
  1: { 1: "P0", 2: "P0", 3: "P1", 4: "P2" },
  2: { 1: "P0", 2: "P1", 3: "P2", 4: "P3" },
  3: { 1: "P1", 2: "P2", 3: "P3", 4: "P3" },
  4: { 1: "P2", 2: "P3", 3: "P3", 4: "P3" },
};

derivePriority(2, 3, { matrix });
derivePriority(2, 3, { fallback: "P2" });
```

An instance-level override can therefore be introduced later by supplying another matrix; the durable state keeps the same `impact`/`urgency` shape and needs no migration. The canonical values are exported as `DEFAULT_PRIORITY_MATRIX`, `DEFAULT_PRIORITY`, and `DEFAULT_PRIORITY_RULES`. Settings-driven matrix editing is deferred.

## Triaging consistently

1. Set impact from the effect on users and flows, not from who reported it.
2. Set urgency from the cost of waiting, independently of impact.
3. Never choose priority by hand; set impact and urgency and read the result.
4. Leave an axis unset only when it genuinely cannot be assessed yet. One unset axis yields `P3`; both unset means no priority.

Spot-check the definitions against real issues before changing the matrix. If two triagers disagree, the axis definition is usually ambiguous rather than the matrix being wrong.

## Related

- [Reserved labels](./reserved-labels.md)
- [The workflow model](../explanation/workflow-model.md)
- [Triage intake](../how-to/use/triage-intake.md)
- [Design](../DESIGN.md)
