# Guide screenshot automation

`manifest.json` maps each scenario and its PNGs to one or more canonical guides. The runner uses `agent-browser` against the real app. `docs/webreel.config.json` is a separate, pinned-webreel video workflow, not the source of these PNGs.

## Generate

Install project dependencies with the project's Bun version (`mise` and `bun install`) and install `agent-browser` and its compatible Chrome (`agent-browser install`). Tested with agent-browser 0.41.2. From the repository root:

```sh
bun docs/screenshots/capture.ts capture all
bun docs/screenshots/capture.ts capture matrix
bun docs/screenshots/capture.ts list
bun docs/screenshots/capture.ts check
```

The first command generates every manifest image on a clean checkout with no existing outputs. To regenerate existing manifest images, review them first and use `capture all --replace`, or use `capture matrix --replace` for one scenario. Without `--replace`, the runner refuses to overwrite an existing output; it never modifies historical assets outside the manifest. A scenario stages all its PNGs before copying; publication is not atomic across files or scenarios, so a failed run may leave earlier outputs in place.

Each scenario has its own fresh database and uploads under a unique OS temporary `funnel-guide-shots-*` directory, server on `127.0.0.1:5198` with `--strictPort`, and browser session. The port must be free; the script never attaches to an existing service. Demo scenarios use the development-only seed and fake forge provider. Onboarding uses an empty migrated database and a fresh, non-demo instance; its displayed instance URL is the fictional `https://funnel.example.com`, while the browser connects locally. Neither mode uses a real installation or inherited Funnel/GitHub credentials. The GitHub API endpoint is pointed at a closed local port; the demo web URL is `https://github.com` for display. Do not use this workflow against production.

Captures use a 1440 × 900 viewport at scale 1, light theme and UTC server time. The runner waits for scenario-specific content and post-action states, including modal opacity. It removes only the temporary directory it created and closes its own server and browser. Interruptions may leave a unique temporary directory behind; inspect it before manual removal. Dates, browser versions, fonts and platform may cause pixel differences. Inspect every PNG for private data, intended state, crop and legibility before committing it; the browser cannot capture terminal or native OS UI.

## Guide references and checks

The manifest and `list` command give the exact outputs and candidate guides. Add an ordinary inline Markdown image reference to **at least one** mapped guide for each capture, for example from `docs/how-to/use/triage-intake.md`:

```md
![The Snooze menu for a staged submission](../../assets/screenshots/triage-intake/02-snooze-menu.png)
```

`bun docs/screenshots/capture.ts check` exits nonzero for missing PNGs, duplicate/invalid names, PNGs with the generated naming convention that are absent from the manifest, or a PNG not referenced in any mapped guide. Historical images with other names are ignored. It never deletes files. The check will fail until the guide references are inserted; `docs/prepare.ts` copies only referenced assets to the site. The checker recognizes ordinary inline Markdown references without titles, matching the asset copier.

## Extend

Add a scenario with an `id`, `guides`, optional `mode: "fresh"` and `steps`. Each scenario starts independently. Use `open` with a local path, `wait` (CSS), `wait-text`, `wait-fn`, `click`, `click-text`, `click-expanded` (for an `aria-expanded` toggle), `click-text-until` (waits for its CSS `selector`), `fill`, `select`, `scroll`, `scroll-to-selector` (aligns the selected element to the viewport), and `capture`. Captures require `file` and a meaningful `state`. Use `<id>/<nn>-<action>-<state>.png`; add readiness and post-action assertions instead of relying on a generic heading or a sleep. Test new scenarios with the real browser, never insert fake states or credentials. See the manifest for examples.

## Exceptions and limits

The initial onboarding screen is captured, but GitHub registration, installation and the final ready screen require a real external GitHub App and are not fabricated. The command palette is captured from the demo instance. Screenshots do not cover every possible action or edge state in every guide. Native Windows setup, hotkeys and service-manager UI, and terminal output require manual capture on the relevant OS in a disposable environment with fictional values and notifications disabled. Record OS, tool version and steps alongside future manual assets, and inspect/redact them. Manual assets are not validated by this manifest.
