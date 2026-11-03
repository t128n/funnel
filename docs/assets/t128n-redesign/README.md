# Historical t128n redesign gallery (pre-Bootstrap)

Screens captured with [`scripts/screenshots/capture.ts`](../../../scripts/screenshots/capture.ts)
against the seeded demo database, at 1440×900. The core views are captured in
light and dark; the matrix set also includes its selected-cell, assessment
queue, Inspector, and mobile states. These files are the preview set used in
pull requests.

- `issues-light.png`, `issues-dark.png`
- `issue-light.png`, `issue-dark.png`
- `board-light.png`, `board-dark.png`
- `plan-light.png`, `plan-dark.png`
- `settings-light.png`, `settings-dark.png`
- `intake-light.png`, `intake-dark.png`
- `matrix-light.png`, `matrix-dark.png`
- `matrix-selected-light.png`, `matrix-queue-light.png`, `matrix-inspector-light.png`
- `issues-mobile.png`, `plan-mobile.png`, `matrix-mobile.png`

Regenerate the full 30-view gallery:

```sh
COOKIE="$(bun scripts/screenshots/seed.ts --out /tmp/funnel-shots)"
FUNNEL_DB=/tmp/funnel-shots/funnel.db \
FUNNEL_SECRET=funnel-screenshots-secret-0123456789abcdef \
bun scripts/screenshots/capture.ts \
  --out /tmp/funnel-shots/out --cookie "$COOKIE" --scale 1
```

These captures are historical. The current design is Bootstrap 5 + Sveltestrap; see [DESIGN.md](../../DESIGN.md). The screenshots are evidence, not a source of truth.
