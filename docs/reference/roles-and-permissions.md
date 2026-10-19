# Roles and permissions

This page records Funnel's instance-wide role hierarchy, capability matrix, account bootstrap, last-administrator protection, enforcement points, and unauthenticated surfaces.

Funnel has three roles stored on `auth_user.role` and managed through the Better Auth admin plugin. The role is part of the session user and is projected into `App.Locals`; server guards are authoritative, and the UI only mirrors them.

## Hierarchy

| Role | Rank | Summary |
| :--- | :--- | :--- |
| `read` | 0 | Views the cockpit and realtime stream and manages only their own account, appearance, and features. |
| `write` | 1 | Adds every issue, comment, label, work-note, attachment, and intake mutation. |
| `admin` | 2 | Adds instance settings, GitHub App management, and people management. |

New accounts default to `read`. The first account to sign in is promoted to `admin` when no administrator exists. Unknown, missing, or `null` role values normalise to `read`.

## Capability matrix

| Capability | `read` | `write` | `admin` |
| :--- | :--- | :--- | :--- |
| View cockpit pages: issues, board, inbox, attention | Yes | Yes | Yes |
| Read issue, comment, label, mirror, user, and attachment endpoints | Yes | Yes | Yes |
| Subscribe to the `/api/events` SSE stream | Yes | Yes | Yes |
| Manage own account, appearance, and features | Yes | Yes | Yes |
| Create and edit issues, change state, and change assignees | No | Yes | Yes |
| Add comments | No | Yes | Yes |
| Add and remove labels | No | Yes | Yes |
| Create, edit, delete, and publish work notes | No | Yes | Yes |
| Upload and delete attachments | No | Yes | Yes |
| Triage intake: accept, dismiss, duplicate | No | Yes | Yes |
| Change instance settings: repositories, projects, intake, board, sync, session | No | No | Yes |
| Manage the GitHub App | No | No | Yes |
| Manage people and roles | No | No | Yes |

## Assignment and bootstrap

Role values are `read`, `write`, and `admin`; the Better Auth admin plugin validates role changes against that set. The plugin's permission table gives `admin` the library's admin permissions, while `read` and `write` both use the non-admin viewer permissions. The distinction between `read` and `write` is enforced by Funnel's own guards, not by Better Auth permissions.

An account is created with `read`. After the user row is created, `promoteFirstAdmin()` checks whether any administrator exists; if none does, it promotes the new account to `admin`. On a single-instance SQLite deployment the small race between two simultaneous first sign-ins is accepted.

Administrators change roles from Settings → People. That action calls Better Auth's `setRole` API, which re-checks the administrator role server-side. The page action also rejects demoting the last administrator with HTTP `409` and the message `At least one administrator is required`. With more than one administrator, self-demotion is permitted.

## Enforcement points

| Layer | Mechanism | Requirement |
| :--- | :--- | :--- |
| Cockpit page loads | `requireUser()` in `src/routes/(app)/+layout.server.ts` | Any signed-in role; unauthenticated visitors are redirected to `/login` with a return path. |
| Settings page loads | `requireUser()` then `requireAdmin()` in `src/routes/(app)/settings/+layout.server.ts` | `/settings`, `/settings/appearance`, and `/settings/features` require any session; every other settings path requires `admin`. A direct URL gets HTTP `403` without the role. |
| People and GitHub App pages | `requireAdmin()` in their page loads | `admin`. |
| Settings form actions | `saveSettingsAction()` checks `canAdmin()` | `admin`; actions re-check because layout loads do not run for actions. |
| People form action | `requireAdmin()` and Better Auth `setRole` | `admin`. |
| Intake triage actions | `apiRole(locals, "write")` | `write` or higher; returns HTTP `401` without a session and `403` without the role. |
| GitHub App reset action | `canAdmin()` | `admin`. |
| Read API routes | `apiRole(locals, "read")` | `read` or higher. |
| Write API routes | `apiRole(locals, "write")` | `write` or higher. This covers issue creation and editing, comments, labels, work notes, and attachments. |
| SSE stream | `apiRole(locals, "read")` on `GET /api/events` | `read` or higher. |
| Better Auth admin endpoints | Admin plugin with `adminRoles: ["admin"]` | `admin`. |

The `read` and `write` roles are distinguished by `hasRole()` against the numeric rank `read < write < admin`; `canWrite()` and `canAdmin()` are the convenience checks. `normalizeRole()` maps any unrecognised value to `read`, so an unknown stored role cannot grant access.

## Unauthenticated surfaces

| Surface | Access | Behaviour |
| :--- | :--- | :--- |
| `/login` | Unauthenticated | Once an App exists, renders the GitHub sign-in page. An authenticated visitor is redirected to a same-origin `redirectTo` target, or to `/inbox`. |
| `/intake` | Unauthenticated | Once an App exists, a JavaScript-free HTML intake form that stages a submission. |
| `POST /api/intake` and its `OPTIONS` preflight | Unauthenticated | Once an App exists, accepts a JSON submission and returns `201 { id }`; CORS is open. Nothing reaches GitHub until a triager accepts it. |
| `/healthz` | Unauthenticated | Liveness response with no database or network access. |
| `/readyz` | Unauthenticated | Readiness response; `503` until the database is reachable and, when the migrations folder can be located, every committed migration is applied. |
| `/onboarding` and its sub-routes | Unauthenticated, optionally token-gated | First-run wizard. `/onboarding` itself redirects to `/login` once an App exists, while the install and installed steps stay reachable so the App can be installed. When `FUNNEL_ONBOARDING_TOKEN` is set, a matching token is required; when unset, the wizard is open on a fresh instance. |
| `/api/auth/*` | Unauthenticated | Better Auth endpoints. They answer `503` while no GitHub App is configured. |

Until the first App exists, the first-run gate redirects `/login`, `/intake` and every other non-exempt path to `/onboarding`. The gate exempts `/onboarding`, `/healthz`, `/readyz`, `/_app`, `/api/auth`, and asset-looking paths whose final segment contains a dot.

Session expiry follows `session.idle_days` (default `30`). If the settings table cannot be read while the auth instance is being built, session lifetime falls back to 30 days.

## Related

- [Settings](./settings.md)
- [Reserved labels](./reserved-labels.md)
- [Environment variables](./environment-variables.md)
- [Design](../DESIGN.md)
