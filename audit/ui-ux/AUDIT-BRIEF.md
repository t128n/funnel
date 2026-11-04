# Funnel UI/UX Audit — Coordinator Brief

**Audit date:** 2026-11-04
**Repository:** `t128n/funnel`
**Revision audited:** `3d229791dadf073eab2c22302d1d59b3c421c81c` (`chore: version packages (#103)`), detached HEAD
**Environment:** local dev server in demo mode (`bun run dev:demo`), seeded disposable SQLite database
**Browser tool:** `agent-browser` 0.41.2 with Chrome 157

## Design authority

Read before starting:

1. [`docs/design/COMPOSITION-A.md`](../../docs/design/COMPOSITION-A.md) — approved design specification.
2. [`docs/design/MIGRATION-MAP.md`](../../docs/design/MIGRATION-MAP.md) — current-to-target mapping.
3. Approved PoC source: [`poc/compositions/src/variants/a/TraditionalApp.svelte`](../../poc/compositions/src/variants/a/TraditionalApp.svelte).
4. PoC screenshots: [`poc/compositions/screenshots/`](../../poc/compositions/screenshots/) (`desktop-a-*.png`, `mobile-a-*.png`).
5. Bootstrap 5.3 docs if you need to confirm a convention: <https://getbootstrap.com/docs/5.3/>.

The audit measures the running application against Composition A and ordinary Bootstrap conventions. The product is deliberately a **traditional, content-first Bootstrap application**: conventional links, compact tables, standard controls, document structure, predictable navigation, minimal decoration. Flag modern-SaaS embellishment and unnecessary custom interaction as problems, not as opportunities.

## Rules of engagement

- **Read-only audit.** Do not modify `src/`, config, or migrations. Do not fix anything. Only write under `audit/ui-ux/`.
- **Never create GitHub issues.** The coordinator owns issue creation.
- **Never touch ports 3000, 5173, 5180, 5199, or another agent's port.** Use only your assigned port and database.
- **Use disposable data only.** Your server has its own demo DB. Mutations are allowed there (e.g. accepting an intake item, saving a setting) but must stay on your instance.
- **Persist as you go.** Write each confirmed finding to your findings file before moving on. If context runs low, save coverage + findings + a checkpoint (routes done, routes left) and return.
- **Do not return raw browser transcripts, page HTML, or large snapshots.** Keep the final response compact.
- **One finding per independently actionable problem.** Group symptoms that share a cause. Do not file a finding per padding difference.
- **Verify before recording.** A finding needs reproduction steps and evidence. Distinguish a verified usability problem from a taste preference. If unsure, record it as an observation in coverage, not a finding.

## Environment and credentials

Each workstream has an isolated app instance and browser session:

| Workstream | Port | Browser session |
| --- | --- | --- |
| A — Shell and navigation | 3001 | `ux-shell` |
| B — Issues and Inbox | 3002 | `ux-issues` |
| C — Planning | 3003 | `ux-planning` |
| D — Organization | 3004 | `ux-org` |
| E — Settings and public | 3005 | `ux-settings` |

Demo mode is pre-authenticated as **Riley Demo** (`demo`), role **admin**. There is no login step. The same demo data is seeded into each instance:

- Repositories: `demo/funnel` (issues #1–#14) and `demo/platform` (issues #1–#8).
- Issues cover Backlog, Todo, In progress, In review, Done, blocked issues, epics, milestones, comments, work notes, and attachments.
- Intake queue: 3 staged submissions; notifications: 4 unread.
- First account is admin; settings are all accessible.

Useful fixture routes:

- Issue index: `/issues`, `/issues?assignee=me`
- Issue detail: `/issues/demo/funnel/1`, `/issues/demo/platform/1`
- Inbox: `/inbox`, `/inbox/submission/1`, `/inbox/demo/funnel/2`
- Planning: `/board`, `/matrix`, `/matrix/demo/funnel/1`, `/plan`, `/day`, `/timeline`
- Organization: `/epics`, `/epics/demo/funnel/10`, `/milestones`, `/milestones/demo/funnel/1`, `/notifications`, `/attention`
- Settings: `/settings` and every section listed in `src/lib/components/settings/sections.ts`
- Public: `/intake`
- Not auditable in demo: `/login` and `/onboarding/*` redirect into the app (auth always active). Note this limitation.

If an instance becomes inconsistent after a destructive test, tell the coordinator; do not restart other instances.

## Browser tool setup

`agent-browser` is installed at `~/.local/share/mise/installs/node/24.22.0/bin/agent-browser`. Every shell command must put it on PATH first:

```bash
export PATH="$HOME/.local/share/mise/installs/node/24.22.0/bin:$PATH"
```

Always pass your own `--session`. Never use the default session.

```bash
agent-browser --session ux-shell open http://127.0.0.1:3001/inbox
agent-browser --session ux-shell set viewport 1440 900
agent-browser --session ux-shell snapshot -i
agent-browser --session ux-shell screenshot audit/ui-ux/screenshots/shell/desktop-inbox-light.png
```

Core loop: `open` → `snapshot -i` → act on `@refs` → fresh `snapshot -i` after any navigation or DOM change. Do not guess selectors when a ref exists. Use `get text`, `get attr`, `is visible`, `eval` for state checks; use `--json` when parsing.

Required viewports:

- Desktop `1440 900`
- Tablet `768 1024`
- Mobile `390 844`

Theme: the app's **Theme** control in the navbar sets Light / Dark / Match system and writes `localStorage["funnel:theme"]`. Click the control and choose explicitly. Confirm with:

```bash
agent-browser --session ux-shell eval "document.documentElement.dataset.bsTheme"
```

Take screenshots in both light and dark. For each screen, cover the states listed in the task assignment where they exist: default, selected/expanded, hover/focus, editing, loading, empty, validation/error, success.

Screenshots go under `audit/ui-ux/screenshots/<workstream>/` with descriptive names:

```text
<area>-<route-or-screen>-<viewport>-<theme>-<state>.png
e.g. issues-detail-desktop-dark-properties-open.png
     inbox-table-mobile-light-default.png
```

Prefer 1–2 screenshots per finding. Screenshots must come from the running app, not mockups.

## Finding format

Append to `audit/ui-ux/findings/<workstream>.md` using exactly this structure:

```markdown
## Finding: <Concise title>

- Route:
- Component:
- Viewport:
- Theme:
- Category: visual consistency | typography/spacing | component behavior | navigation/IA | workflow | feedback/state | responsive | accessibility | bootstrap convention | complexity
- Suggested priority: P1 | P2 | P3
- Screenshot: <relative path>
- Existing issue match: #<n> | none | uncertain

### Problem
...

### Steps to reproduce
1. ...
2. ...

### Actual behavior
...

### Expected behavior
...

### Impact
...

### Suggested direction
...

### Acceptance criteria
- [ ] ...
```

Priority definitions:

- **P1** — broken or severely obstructed workflow (cannot complete the task, data loss risk, unusable at a required viewport).
- **P2** — significant usability issue or recurring visual inconsistency (workaround exists; affects many routes or a core workflow).
- **P3** — localized polish or minor friction.

Do not inflate priority because something is visually noticeable.

## Coverage format

Maintain `audit/ui-ux/coverage/<workstream>.md`:

```markdown
# <Workstream> coverage

Revision: 3d229791dadf073eab2c22302d1d59b3c421c81c
Server: http://127.0.0.1:<port>
Browser session: <name>

| Route / interaction | Desktop | Tablet | Mobile | Light | Dark | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/issues` default | ✅ | ✅ | ✅ | ✅ | ✅ | audited | |
| `/issues` filter edit | ✅ | — | — | ✅ | — | partial | ... |
```

Status values: `audited`, `partial`, `blocked`, `not audited`. Record **interactions**, not just renders. Also list untested areas and blockers at the bottom.

## Existing issues

Before assigning an existing-issue match, run:

```bash
gh issue list --repo t128n/funnel --state all --limit 200
gh issue search --repo t128n/funnel "<keywords>"
```

Known open items that may overlap (verify before citing):

- #99 `chore(ui): remove the repository scope dropdown from the app bar`
- #100 `bug(board): kanban does not fill 100dvh and is cut off at the bottom`
- #16 `bug(ui): feed search is still too narrow to read on /issues`
- #15 `chore(brand): favicon, webmanifest and error page still use the pre-pivot #3574f0`
- #25 command palette / keyboard navigation (feature, not a defect)
- #30 bulk selection in Inbox (feature, not a defect)

## Return format

Return only:

1. Routes audited and interactions tested (counts).
2. Confirmed findings by priority.
3. The highest-impact 3–5 findings with one line each.
4. Blockers / untested areas.
5. Paths to coverage, findings, and screenshot directory.

Keep it under ~40 lines. The files are the record.
