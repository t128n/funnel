# Historical design-pivot captures (pre-Bootstrap)

These images are historical evidence from the Bugzilla design language, before the Bootstrap migration. The current design is documented in [DESIGN.md](../../DESIGN.md). Each
view was captured from the same seeded demo instance, at the same viewport, in
both themes, so the pair shows the design change rather than a data change.

- `before/` — the unmodified tree, captured before the token layer landed.
- `after/` — the tree at that time (now historical).

Files are named `<view>-<light|dark>.png`; all forty exist, twenty per directory.

| View | Page |
| :--- | :--- |
| `issues` | `/issues` |
| `issue` | `/issues/acme/widgets/1` |
| `issue-activity` | `/issues/acme/widgets/1`, scrolled to `Activity` |
| `board` | `/board` |
| `plan` | `/plan` |
| `epics` | `/epics` |
| `milestones` | `/milestones` |
| `attention` | `/attention` |
| `inbox` | `/inbox` |
| `settings-appearance` | `/settings/appearance` |

The gallery in `docs/explanation/design-language.md` embeds the light pairs, plus
the dark pairs for `issue-activity` and `board`.

## How they are produced

- Chromium headless, 1440×900 CSS pixels, `deviceScaleFactor: 2`.
- Both themes come from the same run: `funnel:theme` is set and
  `prefers-color-scheme` is emulated per capture.
- The data is a throwaway SQLite database seeded by
  `scripts/screenshots/seed.ts`; nothing comes from a live repository.
- `scripts/screenshots/capture.ts` waits for each view's readiness selector
  before shooting, so no spinner or empty table is recorded.

```sh
COOKIE="$(bun scripts/screenshots/seed.ts --out /tmp/funnel-shots)"
FUNNEL_DB=/tmp/funnel-shots/funnel.db \
FUNNEL_SECRET=funnel-screenshots-secret-0123456789abcdef \
bun scripts/screenshots/capture.ts --out /tmp/funnel-shots/out --cookie "$COOKIE"
```

Copy the output over the matching directory and keep the view names stable so the
gallery and its test keep resolving. The harness details are in
`scripts/screenshots/README.md`.
