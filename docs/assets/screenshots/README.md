# Documentation screenshots

These images are captured from a seeded demo instance so the documentation can show the real cockpit without exposing a live repository.

| File | Page |
| :--- | :--- |
| `plan-week.png` | `/plan` (week horizon, with the Day tab) |
| `plan-cycle.png` | `/plan?horizon=cycle` |
| `plan-day.png` | `/plan?horizon=day` (ALPEN day view) |
| `settings-planning.png` | `/settings/planning` (estimates, cycle, working hours, roster) |
| `settings-availability.png` | `/settings/availability` (personal hours, blocked windows, calendar feed) |
| `epics-list.png` | `/epics` |
| `epic-detail.png` | `/epics/acme/widgets/4` |
| `inspector-time.png` | `/issues/acme/widgets/1` |
| `inspector-blocked.png` | `/issues/acme/widgets/8` |
| `timeline-light.png` | `/timeline` (light, with the `No due date` table) |
| `timeline-dark.png` | `/timeline` (dark) |

## How they are produced

- A temporary SQLite database is migrated with `bun scripts/release.ts`.
- A demo user, an App row, one repository, three maintainers, ten issues, a milestone, one epic, plan items, events and delays are seeded. The data is illustrative only.
- For the ALPEN pages the seed adds a personal availability row, a Friday lunch window, a one-off school run, timed day blocks and status events for the review column.
- The app runs locally with a signed-in session and the dark theme.
- Chromium headless captures a 1440 px wide viewport at device scale factor 2 against `http://127.0.0.1:5199`.
- The timeline pair is captured from the demo workspace (`bun run dev:demo`) with an extra undated milestone, so the Apache ECharts Gantt and the `No due date` table both appear; the rest of the set uses the harness above.
- The images are not committed from a production instance; no real repository, person or token appears.

If the UI changes, recapture the affected page and replace the file. Keep the page path in the table above so the mapping stays obvious.
