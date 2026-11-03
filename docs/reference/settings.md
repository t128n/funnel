# Settings

This page is the reference for the `state_setting` key registry, including each key's JSON type, default, validation, editing surface, and effect.

Instance settings live in the SQLite `state_setting` table. Each row has a dotted key, a JSON-encoded value, and an `updated_at` timestamp. Lists (`repos`, `projects`) are stored under one key as a JSON array; scalars use one row each. Reads validate every key independently: a missing row uses that key's default, while an unparseable or schema-invalid row is logged and degraded to the default rather than aborting the load.

Writes are validated per key, then the composed configuration is validated against the cross-field rules in `src/lib/server/config.ts`. A settings section sends only its own slice; the write path merges that slice onto the current settings, persists every key in a transaction, drops the cached configuration, notifies the sync scheduler, and publishes a `settings` SSE event.

## Key registry

| Key | JSON type | Default | Validation | Edited at | Effect |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `repos` | Array of `owner/name` strings or `{ "repo": string, "shortcode"?: string }` objects | `[]` | `repo` is trimmed and matches `^[\w.-]+\/[\w.-]+$`; `shortcode`, when present, is trimmed and matches `^[A-Za-z][A-Za-z0-9]{0,5}$`. Shortcodes are normalised to upper case and derived from the repository name when omitted. Duplicate `owner/name` entries are removed case-insensitively, first entry winning. Shortcodes must be unique across the list. | Settings → Repositories (admin); the onboarding repository picker | Repositories that are mirrored, polled, label-provisioned, and offered as issue and intake targets. The shortcode is the project prefix in issue references such as `FIT-12`. |
| `projects` | Array of label strings or `{ "label": string, "name"?: string }` objects | `[]` | `label` is trimmed and non-empty; `name` is optional and trimmed. Duplicate labels are removed case-insensitively, first entry winning. A missing `name` defaults to `label`. | Settings → Projects (admin) | Enables Project grouping in issue feeds and maps each GitHub label to a display name. |
| `intake.default_repo` | String, or the row is absent when unset | Unset | Trimmed `owner/name` matching the repository pattern. After normalisation it must exactly equal one configured `repos` entry. | Settings → Intake (admin) | Target repository when a staged submission is accepted without an explicit selection. If unset and no repository is selected, acceptance fails with `No target repository selected`. |
| `sync.history_days` | Integer | `90` | Integer greater than or equal to `0`. | Settings → Sync (admin) | Closed issues are mirrored only while `closed_at` lies within this many days of the poll; older rows are pruned. Open issues are always retained. |
| `sync.poll_interval_active_seconds` | Integer | `30` | Integer greater than or equal to `0`. | Settings → Sync (admin) | Per-repository polling interval while at least one SSE client is connected. The scheduler wakes every 5 seconds to check which repositories are due. |
| `sync.poll_interval_idle_seconds` | Integer | `300` | Integer greater than or equal to `0`. | Settings → Sync (admin) | Per-repository polling interval while no SSE client is connected. |
| `board.done_days` | Integer | `14` | Integer greater than or equal to `0`. | Settings → Board (admin) | Window for the Done column: closed-as-completed issues whose `closed_at` lies within the window. Cancelled issues are excluded. |
| `board.wip_limits` | Object mapping stage name to integer | `{}` | Keys are restricted to `backlog`, `todo`, `in-progress`, and `in-review`; values are integers greater than or equal to `0`. A missing stage means no limit. `done` is not an accepted key. | Settings → Board (admin) | Advisory Work-in-Progress cap shown on each open board column as `n / limit`, highlighted when exceeded. It does not block transitions, and Done is never capped. |
| `session.idle_days` | Integer | `30` | Integer greater than or equal to `0`. | Settings → Session (admin) | Better Auth session `expiresIn`, in days; `updateAge` remains one day. The value is captured when the auth instance is built, so it applies to sessions created after a restart or a credential change. |
| `notifications.enabled` | Boolean | `true` | Must be a boolean. | Settings → Notifications (admin) | Master switch for all new notification rows: assignments, mentions, watched comments and status/priority/open-closed changes, and new-intake notices. When `false`, sync diffs and intake staging create nothing; existing rows, read state and watches are kept. |
| `notifications.native` | Boolean | `true` | Must be a boolean. | Settings → Notifications (admin) | Whether the Notifications page offers browser notifications and the layout starts the client listener. In-app notifications are unaffected, and each browser must still grant permission and opt in. |
| `notifications.new_intake` | Boolean | `true` | Must be a boolean. | Settings → Notifications (admin) | Whether a staged public intake submission notifies every admin. It applies only while `notifications.enabled` is on; the intake row is still created when either switch is off. |
| `planning.size_minutes` | Object mapping `sm`, `md` and `lg` to integer minutes | `{ "sm": 120, "md": 240, "lg": 480 }` | Object with exactly the keys `sm`, `md` and `lg`; each value is an integer number of minutes greater than or equal to `0`. | Settings → Planning (admin) | The instance-wide size-to-time estimate. Planned hours are derived from the issue's current size label on every read, so changing the map re-prices every existing plan item. An issue without a size label is unestimated and cannot be scheduled. |
| `planning.allocation_percent` | Integer | `60` | Integer in `1..100`. | Settings → Planning (admin) | The share of each maintainer's weekly minutes that Funnel may plan. Capacity is `floor(weekly_minutes * weeks * allocation_percent / 100)`, so the default reserves 40% for reviews, unplanned work and slack. The cap is enforced on every plan mutation. |
| `planning.cycle_weeks` | Integer | `2` | Integer in `1..52`. | Stored only (legacy) | Retained for stored configuration and the calendar helpers. The planner no longer exposes a cycle horizon; weekly capacity always uses one week. |
| `planning.cycle_anchor` | String | `"2024-01-01"` | `YYYY-MM-DD` that is a real Monday in UTC. Any other weekday or a malformed date fails validation; surrounding whitespace is not trimmed. | Stored only (legacy) | The Monday that anchors the retained cycle numbering. Weeks before the anchor floor into negative cycles so historical plan items keep stable windows if a cycle view is reintroduced. |
| `planning.maintainers` | Array of roster objects | `[]` | Each object has `forge`, `instance`, `external_id` and `login` (the mirrored person's identity and display handle), an optional `avatar_url`, `weekly_minutes` (integer greater than or equal to `0`) and `active` (boolean). `weekly_minutes` is stored in minutes even though the page edits decimal hours. Duplicate `(forge, instance, external_id)` rows are rejected. | Settings → Planning (admin) | The per-maintainer net capacity roster. Only active, configured maintainers receive a capacity row and share an issue's estimate; everyone else falls into the unassigned bucket, which has no cap. |

## Cross-field rules

The composed configuration is validated after the per-key checks:

- Repository shortcodes must be unique after normalisation. An explicit shortcode disambiguates repositories whose derived shortcodes collide.
- `intake.default_repo` must exactly equal one of the configured repository slugs. Removing that repository without clearing or changing the default makes the save fail.
- `board.wip_limits` accepts only the four open workflow stages; `done` is not part of the schema.
- `planning.cycle_anchor` must be a real Monday in `YYYY-MM-DD` form. `planning.cycle_weeks` must be in `1..52` and `planning.allocation_percent` in `1..100`.
- `planning.maintainers` must not repeat a `(forge, instance, external_id)` triple. The roster is validated as a whole, so a duplicate row rejects the entire save.
- Duplicate repository slugs and project labels are removed case-insensitively before these checks; the first entry wins.

Because a settings section submits a patch, the patch is merged with the current values before the cross-field checks run. A patch that is valid in isolation but inconsistent with another section is rejected as a whole with HTTP `400`.

Each key is also re-validated on write. `intake.default_repo` is the only key that is deleted when its value is `undefined`; other keys are always written.

## Environment-only GitHub host

`github.url` and `github.api_url` are not members of the `state_setting` registry. They are read from `GITHUB_URL` and `GITHUB_API_URL` and injected into the composed configuration by `validateConfig()`. They are not editable from `/settings` and do not change without a new process environment.

## Corrupt rows

A row that is absent, cannot be parsed as JSON, or fails its key schema is logged and replaced by the key's default for that read. A corrupt row does not abort the load. If individually valid rows compose into an invalid configuration, `getConfig()` rejects with a `ConfigError`; the failed promise is not cached, so a later correction can succeed without a restart.

## Related

- [Environment variables](./environment-variables.md)
- [Reserved labels](./reserved-labels.md)
- [Roles and permissions](./roles-and-permissions.md)
- [Build tasks](./build-tasks.md)
- [Design](../DESIGN.md)
