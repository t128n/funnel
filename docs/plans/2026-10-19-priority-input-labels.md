# Priority inputs as GitHub labels

**Supersedes:** `2026-10-19-derived-priority.md` for the input storage decision.
Priority itself stays derived and is never a GitHub label.

## Ruling

Impact and urgency are GitHub-authoritative reserved labels, because the team
wants GitHub to show the triage inputs. Levels are three-point scales:

- Impact: `sev` (Severe), `mod` (Moderate), `min` (Minor).
- Urgency: `high` (High), `mid` (Mid), `low` (Low).

Priority collapses to three derived tiers: **P1 High**, **P2 Medium**,
**P3 Low**. The 3×3 matrix is diagonal-weighted:

| Impact \ Urgency | high | mid | low |
| :--- | :--- | :--- | :--- |
| sev | P1 | P1 | P2 |
| mod | P1 | P2 | P3 |
| min | P2 | P3 | P3 |

## Architecture

- `src/lib/labels.ts` adds the impact and urgency groups to the canonical
  vocabulary (14 labels total). Provisioning creates them like status/size.
- `deriveMetadata` maps the winning label in each group to `1`–`3`, caches
  `impact`/`urgency` on `mirror_github_issue`, and computes `priority`.
- `withReserved` enforces one label per group for create/update; the API and
  client expose `impact`/`urgency` shortcuts.
- The Inspector shows a single **Priority** pill. Its popover has one 0–3
  slider per axis (0 = not assessed) and shows the level name/definition below
  each slider. Commits write the corresponding GitHub label.
- The local `state_issue_priority` table and `/priority` endpoint are removed.
- Retired `p1`–`p3` labels are still compared to the derived value for the
  conflict flag, never written or provisioned.

## Verification

- Domain tests cover all 3×3 cells, fallbacks, label mapping and retirement.
- Sync tests cover label → cache → priority, including a retired-label mismatch.
- Mutation tests cover impact/urgency shortcuts and invalid values.
- `bun run check` and the full `bun test` suite.
