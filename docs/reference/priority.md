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

## Priority matrix

Read the row as impact and the column as urgency. Higher impact and urgency are lower numbers, so the most severe combination is the top-left cell.

| Impact \ Urgency | `high` | `mid` | `low` |
| :--- | :--- | :--- | :--- |
| `sev` | **P1** | **P1** | P2 |
| `mod` | **P1** | P2 | P3 |
| `min` | P2 | P3 | P3 |

`P1` is the highest priority and `P3` the lowest, named High, Medium and Low. The matrix is monotonic: worsening either axis never improves priority.

### When an axis is unset

If either label is absent — or the pair is malformed — the priority projection is **`P3`**. Missing input is treated as “not yet assessed”, not as evidence of severity; a triager can add the missing label to raise the result. Both labels absent means an issue has no priority at all, and the cockpit renders the empty state.

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
