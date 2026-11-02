# Troubleshoot Funnel

Work from the process and its probes to the specific surface: onboarding, authentication, readiness, sync, the event stream, uploads, or permissions.

## First checks

```sh
curl -fsS http://127.0.0.1:3000/healthz
curl -i http://127.0.0.1:3000/readyz
```

- `/healthz` returns `200` whenever the process is alive. It does not touch the database or GitHub.
- `/readyz` returns `200` only when the database is reachable and every committed migration is applied; otherwise `503` with a reason.

Confirm which instance and version you are looking at:

```sh
funnel --version
docker ps --filter name=funnel        # container
```

```powershell
Get-Service Funnel                    # Windows service
```

Set `LOG_LEVEL=debug` temporarily if the default `info` logs do not show the failure, restart, reproduce, then set it back. Read logs where the process writes stdout:

```sh
docker logs --tail 200 -f funnel
```

```powershell
Get-ChildItem C:\ProgramData\Funnel\*.log | Get-Content -Tail 200
```

Use the sections below once you know whether the failure is before onboarding, during sign-in, at readiness, during sync, in the browser stream, or at an upload or write boundary.

## The instance keeps redirecting to `/onboarding`

This is expected while no GitHub App exists: every route except the wizard, health probes, assets and `/api/auth/*` is gated. It becomes a lockout when `FUNNEL_ONBOARDING_TOKEN` is set and you do not have the token.

**Checks**

- Can you open **Settings → GitHub App**? If it shows an App, the instance is onboarded and `/onboarding` redirects to `/login`; the problem is sign-in, not the first-run gate.
- Is `FUNNEL_ONBOARDING_TOKEN` set in the effective environment (`.env`, container variables, service variables)? Changes are read at boot; a restart is required.
- The accepted token is stored in an `HttpOnly` cookie named `funnel_onboarding_token` for one hour. An expired cookie, a different browser, or a different hostname (including IP versus DNS name) presents the token prompt again.
- The token form submits a `GET` to `/onboarding?token=...`. Special characters must be URL-encoded if you type the URL directly.

**Fix**

- Open `https://<host>/onboarding?token=<value>` or enter the token in the wizard's **Onboarding token required** form. Keep using the same hostname so the cookie applies.
- If the token is lost, set a new `FUNNEL_ONBOARDING_TOKEN` and restart. If the instance is on a trusted network and has not been claimed, unset it and restart; anyone who can reach a fresh instance can then complete onboarding.
- Once an App exists, the gate closes automatically. `FUNNEL_ONBOARDING_TOKEN` then only matters if you reset the App and return to onboarding.

## Onboarding reports a missing or invalid GitHub App

**Checks**

- **Settings → GitHub App** shows no App after you were previously signed in, or the wizard keeps returning to `/onboarding` after creating one.
- The process logs contain `No GitHub App configured; complete onboarding first` or a credential-decryption failure (for example `Unsupported state or unable to authenticate data`).
- The database is on a persistent volume. A container recreated without `/data`, or a PaaS service with an ephemeral filesystem, loses the `state_github_app` row and the App appears to vanish.
- The App still exists on GitHub and is not suspended. **Settings → GitHub App → Open App** must point at the correct host.
- For GitHub Enterprise Server (GHES), both `GITHUB_URL` and `GITHUB_API_URL` are set and Funnel was restarted.

**Fix**

- On a genuinely fresh instance, complete [onboarding](../configure/onboard-github-app.md).
- If the database was lost, onboard again. The old App on GitHub is separate; uninstall or delete it if it is still installed, or delete it there if you want to reuse its name.
- If the row exists but cannot be decrypted, `FUNNEL_SECRET` changed or no longer matches the backup. Restore the original secret. If it is lost, the App credentials are unrecoverable and the settings UI may be unreachable because reading the row is what fails: stop the instance, take a copy of the database, delete the `state_github_app` row with a SQLite client, restart, and onboard again. Users must sign in again. Data and the mirror remain, but the wizard's repository selection replaces the configured repository list, so re-check **Settings → Repositories** afterwards. Restoring a backup with its secret is preferable.
- If the App was deleted or suspended on GitHub, reset and re-onboard. An App JWT cannot be minted from credentials that no longer exist upstream.
- On GHES, correct both host variables, restart, then reset and re-onboard if the App was created against the wrong host.

Do not hand-edit the encrypted credential values. Prefer restoring a backup; the targeted row deletion above is a last resort. With the instance stopped and a copy of the database taken, the last-resort reset is:

```sh
# Use the path from FUNNEL_DB; on Windows, C:\ProgramData\Funnel\funnel.db.
sqlite3 /path/to/funnel.db "delete from state_github_app;"
```

This deletes only the App credentials row; settings, users, work notes, attachments metadata and the mirror remain. Start the instance and onboard again.

## Sign-in fails or GitHub writes return token errors

Symptoms include GitHub's `redirect_uri_mismatch` page, "bad verification code", a login loop, a `401` after signing in, or a `502` from a write route when the user token cannot be resolved (the log says `user token unavailable`).

**Checks**

- `FUNNEL_URL` matches the exact browser origin: scheme, host and port, with no trailing slash. If it is unset, Funnel falls back to the App's captured base URL or the request origin, which is fragile behind a proxy.
- The GitHub App's callback URL is `{baseUrl}/api/auth/callback/github`, where `baseUrl` is the public origin captured at onboarding. Check it in the App's settings on GitHub (or GHES).
- Behind a proxy, `PROTOCOL_HEADER` and `HOST_HEADER` are set and the proxy sends `X-Forwarded-Proto` and `X-Forwarded-Host`. See [Put Funnel behind a reverse proxy](../deploy/reverse-proxy.md).
- The browser accepts cookies for the host, and the instance is reached over the scheme in `FUNNEL_URL` (HTTPS for a public deployment).
- The host clock is correct. Large skew breaks OAuth codes and App JWTs.
- The logs show `bad callback`, `manifest conversion failed`, or `user token unavailable`.
- For GHES, both GitHub host variables are correct.

**Fix**

- Set `FUNNEL_URL` to the public origin and restart.
- If the public origin changed after onboarding, update the App's callback URL on GitHub or GHES. If you cannot, reset the App and re-onboard with the correct `FUNNEL_URL`.
- Sign out and sign in again. User-to-server tokens last about eight hours and are refreshed automatically; a failed refresh requires a fresh authorisation.
- If the App's authorisation was revoked or its permissions changed, re-authorise the App from its GitHub installation page.
- Ensure the browser is not blocking the session cookie and that a proxy is not rewriting or dropping `Set-Cookie`.
- A `403` after sign-in is usually a role or GitHub repository-permission problem, not a broken session; see [A page or action returns 403](#a-page-or-action-returns-403).

## `/readyz` returns 503

Read the JSON body; it distinguishes the two cases:

| Body | Meaning |
| :--- | :--- |
| `{"status":"starting","reason":"database not migrated"}` | The database is unreachable, or it has no migrations table yet. |
| `{"status":"starting","reason":"migrations pending","applied":N,"expected":M}` | The database is reachable but some committed migrations have not been applied. |

**Checks**

- `FUNNEL_DB` points at the database the running instance actually uses. Relative defaults resolve from the working directory, so `./data/funnel.db` from a different directory is a different file.
- The container has its volume mounted at `/data`, and the process can write there.
- The data directory and database file are writable, and the disk is not full.
- A release step ran against the same database, not a copy or a different relative path.
- The process logs show `[funnel] database ready at ...` or `[funnel] migration failed: ...`.
- The migrations folder is discoverable. In a normal checkout, adapter-node deploy, or compiled executable, it is found automatically; unusual layouts may need `FUNNEL_MIGRATIONS_DIR`.

**Fix**

- If migrations are pending, run the migration step with the same environment and path:

```sh
# Packaged executable
FUNNEL_DATA_DIR=/path/to/data /path/to/funnel --migrate

# From a checkout
FUNNEL_DB=/path/to/data/funnel.db mise run release

# Container
docker run --rm -v funnel-data:/data funnel:<tag> --migrate
```

- On Windows, a manual `funnel.exe --migrate` does not inherit `FUNNEL_DATA_DIR` from `funnel-service.xml`. Set it explicitly, or set `FUNNEL_DB` to the service database:

```powershell
cd C:\ProgramData\Funnel
$env:FUNNEL_DATA_DIR = "C:\ProgramData\Funnel"
.\funnel.exe --migrate
```

- If the path is correct but the process still exits on boot, fix the first `migration failed` error rather than restarting repeatedly. Back up the database before manual repair.
- A `503` from `/api/auth/*` while the instance has no App is expected (`Onboarding incomplete: no GitHub App configured`); complete onboarding.
- `/readyz` does not test GitHub. A `200` means the database and schema are ready, not that sync is succeeding.

## A repository is degraded or rate-limited

Once the repository's mirror row exists, a failed cycle is isolated: the scheduler continues with other repositories, sets `degraded = 1` on the repo row, and logs a warning. A successful poll or the nightly reconciliation clears the flag.

**Checks**

- The logs contain `repo poll failed` with a `repo` and `err` field. The error often carries GitHub's status and message, for example `403 API rate limit exceeded`, `403 Resource not accessible by integration`, `404 Not Found`, or `401 Bad credentials`.
- Look for the repo row and its timestamps (if the `sqlite3` CLI is available):

```sh
sqlite3 /path/to/funnel.db \
  "select org, name, degraded, last_polled_at, last_reconciled_at from mirror_github_repo;"
```

- Check whether there is more than one Funnel instance polling the same installation. Duplicate instances multiply requests and share a quota.
- Confirm the repository is part of the App installation and has not been renamed or transferred, and that the installation still grants access.
- Distinguish a rate limit (`403`/`429` with `API rate limit exceeded`, `Retry-After` or `X-RateLimit-Reset`) from a permission failure (`Resource not accessible by integration`).

**Fix**

- For a rate limit, wait for the reset, then reduce load: raise `sync.poll_interval_active_seconds` and `sync.poll_interval_idle_seconds` under **Settings → Sync**, and remove repositories you do not need. The active interval is used while any cockpit tab has an SSE stream open; closing the last tab falls back to the idle interval. The nightly full sweep at 03:00 local is the largest burst.
- Conditional requests that return `304` are cheap, but every cycle also refreshes labels and assignable users, and conflict resolution fetches timelines. Shorter intervals are a real quota cost.
- For a permission failure, grant the App Issues write, Metadata read and Contents read, add the repository to the installation, and approve any updated permissions on GitHub. Then let the next poll run.
- For `404 Not Found`, add the repository to the installation and check the `owner/name` in **Settings → Repositories**.
- For `401 Bad credentials`, the App credentials are invalid or belong to another host; reset and re-onboard if the secret is correct.
- Do not restart repeatedly to force a retry. The repo stays on its normal schedule; a success clears `degraded`.

## No issues appear in the cockpit

**Checks**

- The repository is in **Settings → Repositories** in exact `owner/name` form, and the App installation grants access to it.
- The logs show no `repo poll failed` warning for that repository. Successful polls are logged at `debug` as `repo polled`; set `LOG_LEVEL=debug` if you need positive confirmation.
- Timing: the first poll is staggered across the interval. With a cockpit tab open the interval is 30 seconds; idle it is 300 seconds. Allow up to one interval, then refresh.
- `sync.history_days` is 90 by default. Open issues are always in scope; closed issues only while `closed_at` is inside the window.
- Pull requests are never mirrored; a repository with only PRs will look empty.
- The issue's workflow state matters. An issue with **no reserved status label** is untriaged and appears in the **Inbox**, not in **Issues** or on the **Board**. **Issues** shows only issues with a status label; **Board** shows the four open statuses plus recently completed work. Check the Inbox before concluding the sync failed.
- For GHES, the App was created and installed on the same host Funnel is configured against.

**Fix**

- Add the repository in [Settings → Repositories](../configure/repositories.md), save, and wait for the next scheduler tick. A newly added repository is scheduled with a stagger.
- Install the App on the repository (or add it to the existing installation) on GitHub.
- If you need older closed issues, raise the history window in **Settings → Sync**. The incremental cursor is the newest mirrored `updated_at`, so older issues are not fetched immediately; the nightly full reconciliation at 03:00 local backfills them.
- If the issue has no status label, triage it from the Inbox or add a status label; it will leave the Inbox and appear in Issues (and on the Board if it is open).
- For deleted or transferred issues, wait for reconciliation; incremental polling cannot see a deletion on the old repository, but the full sweep prunes rows absent upstream.

## The cockpit stops updating

The browser uses `GET /api/events`, an HTTP Server-Sent Events stream. It sends `retry: 5000`, a `: connected` comment, and a `: ping` every 12 seconds. The browser's `EventSource` reconnects automatically.

**Checks**

- In the browser's network panel, `/api/events` returns `200` with `Content-Type: text/event-stream` and stays open. A `401` means the session expired or the cookie is not being sent.
- Heartbeat frames appear roughly every 12 seconds. If data arrives only in bursts, or the connection closes at a fixed interval, a proxy is buffering or timing out.
- The instance was restarted. A restart closes every stream; the browser reconnects after about five seconds, but events published while it was disconnected are not replayed.
- Multiple proxies or a CDN sit in front of Funnel; each layer must pass `text/event-stream` through without buffering or compression.

**Fix**

- Disable proxy buffering and caching for `/api/events`, and set a read timeout longer than the heartbeat. Funnel already sends `X-Accel-Buffering: no`, but nginx and other proxies need `proxy_buffering off` and a long `proxy_read_timeout`. See [Put Funnel behind a reverse proxy](../deploy/reverse-proxy.md).
- Do not configure WebSocket upgrade headers; Funnel does not use WebSockets.
- Sign in again if the stream returns `401`.
- After a reconnect, refresh the page to pick up changes made while the stream was down. There is no event replay; the mirror is the source for a fresh load.

## An upload fails with 413

Three independent limits can reject an upload:

| Response | Limit | Where to change it |
| :--- | :--- | :--- |
| Proxy-generated `413` (often HTML) | `client_max_body_size` | Reverse-proxy configuration. |
| adapter-node `413 Payload Too Large` | `BODY_SIZE_LIMIT` (default `512K`) | Funnel environment. |
| Funnel JSON `{"message":"File exceeds the 10485760 byte limit"}` | `FUNNEL_UPLOAD_MAX_BYTES` (default `10485760`) | Funnel environment. |

**Checks**

- Read the response body and headers to see which layer answered. A proxy rejection usually never reaches Funnel's logs.
- Confirm `BODY_SIZE_LIMIT` is at least `FUNNEL_UPLOAD_MAX_BYTES` plus multipart overhead. The Windows service definition sets `BODY_SIZE_LIMIT=25M`; the container does not set it, so Docker installations use adapter-node's `512K` unless you pass it.
- Confirm the proxy's body limit is at least as large. nginx defaults to `1m`.

**Fix**

- Set both Funnel variables and the proxy limit to a compatible size, then restart:

```dotenv
FUNNEL_UPLOAD_MAX_BYTES=20971520
BODY_SIZE_LIMIT=25M
```

- A `400` saying the body must be `multipart/form-data`, or that a `file` field is required, is a client-shape problem, not a size problem.
- A `404` saying the repository is not mirrored means the repository is not configured or has not synced; fix that first.
- A `403` with `Forbidden` means the session has `read` but not `write`; see the next section.

## A page or action returns 403

Identify which layer produced the 403:

- **Funnel page:** "You do not have access to this page." An authenticated user opened an admin-only settings section. Ask an administrator to change the role in **Settings → People**.
- **Funnel JSON:** `{"message":"Forbidden"}`. The session lacks `write` for a mutation (issues, comments, labels, work notes, attachments, intake triage). Reading requires `read`; mutations require `write`; the workspace and system settings sections and People require `admin`.
- **Funnel JSON from a settings action:** `Administrator role required`. Same remedy: promote the account.
- **GitHub 403 forwarded by a write:** the signed-in user's token lacks repository permission, or the App lacks a required permission. Messages such as `Resource not accessible by integration` point at the App installation; a plain permission message points at the user's repository access.
- **SvelteKit CSRF 403:** `Cross-site POST form submissions are forbidden` means the request's `Origin` did not match the origin Funnel derived for itself. Set `FUNNEL_URL` to the exact browser origin, and behind a TLS-terminating proxy set `PROTOCOL_HEADER` and `HOST_HEADER`. Direct HTTP executables since 0.0.3 derive the scheme from the request.
- **Proxy or web application firewall (WAF) 403:** the request never reaches Funnel. Check the proxy's access log and rule set.

**Fix**

- Promote the account under **Settings → People**. The last administrator cannot be demoted, and new accounts start as `read`; the first account to sign in is promoted automatically.
- For GitHub-backed writes, confirm the user can write to the repository on GitHub. Funnel uses the user's token, so GitHub's permissions apply on top of Funnel's role.
- For App permission failures, update the App's permissions on GitHub (Issues write, Metadata read, Contents read), approve the update on the installation, and ensure the repository is selected. Then retry or wait for the next poll.
- A `404 {"message":"Not synced, open on GitHub"}` is not a role problem: the repository is not configured or the App is not installed on it.

## Finding the log line

Funnel logs structured JSON to stdout in production. Set `LOG_LEVEL` to `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`; the default is `info`. Restart after changing it. `debug` is useful for a single reproduction but verbose for steady state.

- Docker: `docker logs --tail 200 -f funnel`.
- Windows service: WinSW's rolled log files in the install directory (`C:\ProgramData\Funnel` by default), 10 MB per file and eight files kept.
- Bare metal or systemd: wherever the process's stdout is captured, for example `journalctl -u <unit>`.

Every request gets a UUID in `event.locals.requestId`. An unexpected 5xx page shows it as **Reference:** `<uuid>`. Search the logs for that id:

- `unhandled request error` is an unexpected throw at `error` level, with the stack and `requestId`, `method`, `path`, `kind` and `status`.
- `request failed` is a 5xx at `error` level.
- `request rejected` is an expected 4xx at `warn` level.

Background work logs carry a `component` (for example `sync`, `reconcile`, `onboarding`, `http`) and usually a `repo`. Search for `repo poll failed`, `reconciliation failed`, `provisioning failed`, `user token unavailable`, or `post-write refresh failed`.

Useful startup lines:

- `database ready at ... (N migration(s) applied, M total)`
- `startup complete`
- `sync worker started`
- `reconciliation scheduled`

If there are no logs at all, check that `LOG_LEVEL` is not `silent`, that the process is running from the directory containing the expected `.env`, and that stdout is actually captured. Seeing logs from two versions or two hostnames usually means two instances; stop one.

Log fields redact authorisation headers, cookies, tokens, client secrets and private keys. Do not expect to see those values, and do not enable a custom logger that bypasses the redaction.

## Related

- [Environment variables](../../reference/environment-variables.md) — `FUNNEL_ONBOARDING_TOKEN`, `FUNNEL_SECRET`, `BODY_SIZE_LIMIT`, `LOG_LEVEL` and the rest.
- [Command-line interface](../../reference/cli.md) — `--migrate`, `--healthcheck`, `--version`.
- [HTTP API](../../reference/http-api.md) — probe and error response contracts.
- [Sync and mirror](../../explanation/sync-and-mirror.md) — polling, cadence, degraded repos and reconciliation.
- [Security model](../../explanation/security-model.md) — sessions, tokens, roles and correlation ids.
- [Deployment model](../../explanation/deployment-model.md) — liveness, readiness and the single instance.
- [Onboard the GitHub App](../configure/onboard-github-app.md)
- [Add or remove repositories](../configure/repositories.md)
- [Configure sync](../configure/sync.md)
- [Manage people and roles](../configure/people-and-roles.md)
- [Deploy with Docker](../deploy/docker.md)
- [Install as a Windows service](../deploy/windows-service.md)
- [Put Funnel behind a reverse proxy](../deploy/reverse-proxy.md)
- [Use GitHub Enterprise Server](../deploy/github-enterprise-server.md)
- [Back up and restore](backup-and-restore.md)
- [Upgrade Funnel](upgrade.md)
