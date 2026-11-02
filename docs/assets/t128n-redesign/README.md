# t128n redesign gallery

Screens captured with [`scripts/screenshots/capture.ts`](../../../scripts/screenshots/capture.ts)
against the seeded demo database, at 1440×900. The same views are captured in
light and dark; the files here are the preview set used in the pull request.

- `issues-light.png`, `issues-dark.png`
- `issue-light.png`, `issue-dark.png`
- `board-light.png`, `board-dark.png`
- `plan-light.png`, `plan-dark.png`
- `settings-light.png`, `settings-dark.png`
- `intake-light.png`, `intake-dark.png`
- `issues-mobile.png`, `plan-mobile.png`

Regenerate the full 30-view gallery:

```sh
COOKIE="$(bun scripts/screenshots/seed.ts --out /tmp/funnel-shots)"
FUNNEL_DB=/tmp/funnel-shots/funnel.db \
FUNNEL_SECRET=funnel-screenshots-secret-0123456789abcdef \
bun scripts/screenshots/capture.ts \
  --out /tmp/funnel-shots/out --cookie "$COOKIE" --scale 1
```

The screenshots are evidence, not a source of truth. The values live in
`src/lib/styles/tokens.css`; the application rules live in `docs/DESIGN.md`.
