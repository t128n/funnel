# Screenshot harness

Reproducible 1440×900 captures of the nine cockpit views, in light and dark,
against a throwaway database. Used for the before/after design gallery.

Both scripts run under Bun outside Vite. They import only `bun:sqlite`,
`node:*`, `better-call` (cookie signing) and `playwright`; `$app/*` and `#lib/*`
are virtual modules and are deliberately not used.

## 1. Seed the demo database

```sh
COOKIE="$(bun scripts/screenshots/seed.ts --out /tmp/funnel-shots)"
```

- Writes `/tmp/funnel-shots/funnel.db` (override with `--db <path>`).
- Refuses to run when the DB file already exists; delete the directory to
  re-seed.
- Applies every `drizzle/<timestamp>_<name>/migration.sql` in sorted order.
- Seeds one repo (`acme/widgets`), users dana/mira/otto, the canonical labels,
  one milestone, six issues (one closed, one blocked, one epic, one untriaged)
  and two markdown comments per issue.
- Seeds a GitHub App row, an admin user and a session, so the first-run gate and
  the auth gate are both satisfied.
- Prints **only** the `better-auth.session_token=…` cookie on stdout. The path
  goes to stderr.

The secret must match the server's `FUNNEL_SECRET`. Pass `--secret <value>` or
set `FUNNEL_SECRET`; the default is fixed so both scripts agree out of the box.

## 2. Start the server

Either let `capture.ts` start it (see below), or start it yourself:

```sh
FUNNEL_SECRET=funnel-screenshots-secret-0123456789abcdef \
FUNNEL_DB=/tmp/funnel-shots/funnel.db \
FUNNEL_URL=http://127.0.0.1:5199 \
GITHUB_URL=https://github.com \
GITHUB_API_URL=http://127.0.0.1:9 \
LOG_LEVEL=warn \
bun --bun vite dev --port 5199 --strictPort
```

`GITHUB_API_URL` points at a closed port on purpose: the demo reads only the
local mirror, and a failing sync is expected and harmless.

## 3. Capture

Against an already-running server:

```sh
bun scripts/screenshots/capture.ts \
  --base-url http://127.0.0.1:5199 \
  --out /tmp/funnel-shots/out \
  --cookie "$COOKIE"
```

Or self-start `vite dev` on 5199 and stop only that child process:

```sh
FUNNEL_DB=/tmp/funnel-shots/funnel.db \
FUNNEL_SECRET=funnel-screenshots-secret-0123456789abcdef \
bun scripts/screenshots/capture.ts \
  --out /tmp/funnel-shots/out \
  --cookie "$COOKIE"
```

`--db` and `--secret` are accepted as flags for the self-starting path.

Output is 18 PNGs named `<view>-<light|dark>.png`: `issues`, `issue`, `board`,
`plan`, `epics`, `milestones`, `attention`, `inbox`, `settings-appearance`.
The viewport is 1440×900 at `deviceScaleFactor: 2`, with
`<html class="dark">` driven by `funnel:theme` and `prefers-color-scheme`
emulated per theme.

## Browser

`playwright` is a dev dependency. If Chromium is already installed, point at it:

```sh
FUNNEL_CHROMIUM=/path/to/chrome bun scripts/screenshots/capture.ts …
```

Otherwise the harness looks for
`~/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` and falls back to
Playwright's own bundled browser. Install/repair the browser with:

```sh
bunx playwright install chromium
bunx playwright install-deps chromium   # Linux system libraries + fonts
```

On a headless Linux host that is missing shared libraries or fonts, Chromium can
launch but paint no text (or fail with `libnspr4.so: cannot open shared object
file`). Point `LD_LIBRARY_PATH` at the installed libraries and `FONTCONFIG_FILE`
at a fontconfig file that lists an installed font directory; both are
environment concerns, not settings in these scripts.

## Notes

- The cookie is URL-encoded once by `better-call`; pass it through verbatim
  (quoted) and do not encode it again.
- `capture.ts` waits for the `load` event plus a short settle, because the data
  feeds hydrate client-side and the SSE stream never reaches network idle.
- The seeded timestamps are epoch milliseconds; Better Auth's own tables use
  seconds, matching the server schema.
