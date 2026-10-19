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

If either impact or urgency is unset, malformed, or outside `1`–`4`, the derived priority is **`P3`**. Missing input is treated as “not yet assessed”, not as evidence of severity; a triager can set the missing axis to raise the result. This fallback is configurable through `PriorityRules.fallback`, but `P3` is the instance default.

## Where the axes live

Impact and urgency are stored in the issue body's trailing `<!-- funnel_metadata -->` envelope, grouped under `priority:`. They are inputs, not labels: the `p1`–`p3` labels remain the current priority projection until the derived-priority migration lands.

```markdown
<!-- funnel_metadata
priority:
  impact: 2
  urgency: 3
blocked:
  is_blocked: false
-->
```

Round-trip rules:

- `readPriorityInputs(body)` (`readImpactUrgency`) returns `{ impact, urgency }`, with `null` for an unset or invalid axis.
- `writePriorityInputs(body, inputs)` (`writeImpactUrgency`) writes the canonical grouped form and preserves every other section.
- An unset axis is omitted rather than written as a placeholder.
- Clearing both axes removes the `priority:` section. If no other section remains, the envelope is removed too.
- The older top-level form (`impact: 2` / `urgency: 3` directly under the envelope) is still read; the next write normalises it into the `priority:` section.
- Editing the description re-attaches the envelope verbatim, so prose edits cannot drop the axes.

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

An instance-level override can therefore be introduced later by supplying another matrix; the stored metadata keeps the same `impact`/`urgency` shape and needs no migration. The canonical values are exported as `DEFAULT_PRIORITY_MATRIX`, `DEFAULT_PRIORITY`, and `DEFAULT_PRIORITY_RULES`.

## Triaging consistently

1. Set impact from the effect on users and flows, not from who reported it.
2. Set urgency from the cost of waiting, independently of impact.
3. Never choose priority by hand; read the matrix.
4. Leave an axis unset only when it genuinely cannot be assessed yet. Either unset axis yields `P3`.

Spot-check the definitions against real issues before changing the matrix. If two triagers disagree, the axis definition is usually ambiguous rather than the matrix being wrong.

## Related

- [Reserved labels](./reserved-labels.md)
- [The workflow model](../explanation/workflow-model.md)
- [Triage intake](../how-to/use/triage-intake.md)
- [Design](../DESIGN.md)
