# Composition A production captures

Preview evidence for the approved **Composition A — Traditional Bootstrap
Application** migration (issue #98, PR #97). These are captures of the running
Funnel application, not PoC frames or mockups.

- `desktop/` — 1440×900 CSS px, DPR 1, light and dark.
- `mobile/` — 390×844 CSS px, DPR 2, light and dark.
- `nav-more-*.png` — the desktop `More` overflow menu open.
- `nav-open-*.png` — the mobile one-layer navbar collapse open.

Captured views: Issues, issue document (top and activity), Inbox, Board,
Matrix, Plan, Timeline, Epics, Milestones, Attention, Notifications, Settings
(planning), Intake, and the two navigation states.

## Regenerate

The repository harness seeds a throwaway database and captures the app through
Playwright:

```sh
rm -rf /tmp/funnel-ca
COOKIE="$(bun scripts/screenshots/seed.ts --out /tmp/funnel-ca)"

FUNNEL_DB=/tmp/funnel-ca/funnel.db \
FUNNEL_SECRET=funnel-screenshots-secret-0123456789abcdef \
bun scripts/screenshots/capture.ts \
  --out docs/assets/composition-a/desktop \
  --cookie "$COOKIE" --scale 1

FUNNEL_DB=/tmp/funnel-ca/funnel.db \
FUNNEL_SECRET=funnel-screenshots-secret-0123456789abcdef \
bun scripts/screenshots/capture.ts \
  --out docs/assets/composition-a/mobile \
  --cookie "$COOKIE" --scale 2 --width 390 --height 844
```

The seed includes two staged intake submissions and two untriaged issues so
the Inbox triage table has both row kinds. Open the mobile navbar (or the
desktop `More` menu) before capturing the navigation states.

The design contract is
[`docs/design/COMPOSITION-A.md`](../../design/COMPOSITION-A.md); the route map
is [`docs/design/MIGRATION-MAP.md`](../../design/MIGRATION-MAP.md). Layout
conventions live in [`docs/DESIGN.md`](../../DESIGN.md).
