# Install Funnel as a Windows service

Build the standalone executable and install it under the WinSW service wrapper, with all state under `C:\ProgramData\Funnel`.

## Before you start

- A supported Windows Server or Windows 10/11 host on x64, an elevated PowerShell prompt, and outbound HTTPS access to GitHub.
- `mise` and the pinned Bun toolchain. Run `mise trust` once per checkout so the tasks load.
- A public origin for the instance, for example `https://funnel.example.com`, if it will sit behind a reverse proxy. Set `FUNNEL_URL` before onboarding.
- The data directory is the service's working directory, so it holds the database, uploads and the generated `.env`.

## 1. Build `dist\funnel.exe`

From the repository root in PowerShell:

```powershell
mise trust
mise run exe
.\dist\funnel.exe --version
mise run verify        # optional: check + test + intake:check + build + exe
```

`mise run exe` depends on `mise run build` and `mise run intake:exe`, and writes `dist\funnel.exe` (plus the optional `dist\funnel-intake.exe`, which the service does not use). The executable embeds Bun, the server, client assets, the native Markdown addon and the committed migrations; the host needs no Node, Bun or container runtime.

Build on Windows for Windows. Cross-compiling with `--target=bun-windows-x64` requires the Windows `satteri` package to be installed on the build host, so building natively is the reliable path.

## 2. Install the service

Run from an elevated PowerShell prompt:

```powershell
powershell -ExecutionPolicy Bypass -File packaging\windows\install-service.ps1
```

From a release folder that contains `funnel.exe`, use the script and executable side by side:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-service.ps1 -ExePath .\funnel.exe
```

The installer:

- copies `funnel.exe` to the install directory;
- downloads WinSW 2.12.0 as `funnel-service.exe` (use `-WinSwPath` on an air-gapped host);
- writes `funnel-service.xml` next to the WinSW host;
- generates the data directory's `.env` (by default `C:\ProgramData\Funnel\.env`) with a random `FUNNEL_SECRET` and a blank `FUNNEL_URL`;
- adds an inbound firewall rule named `Funnel (TCP <port>)` for any profile;
- registers a service named `Funnel`, running as `LocalSystem`, with automatic delayed start and restart-on-failure, and starts it unless `-NoStart` is given.

Useful parameters:

| Parameter | Default | Effect |
| :--- | :--- | :--- |
| `-ExePath` | auto-detected | Source executable to install. |
| `-InstallDir` | `C:\ProgramData\Funnel` | Where the executable, WinSW host, XML and logs live. |
| `-DataDir` | same as `-InstallDir` | Database, uploads and `.env`; also the service working directory. |
| `-Port` | `3000` | Listen port in the service definition and firewall rule. |
| `-LogLevel` | `info` | `LOG_LEVEL` written into the service definition. |
| `-SkipFirewall` | off | Do not create the inbound rule. |
| `-NoStart` | off | Register the service without starting it. |

The installer **does not overwrite** an existing `funnel-service.xml` or `.env`. On a re-run, `-Port` and `-LogLevel` do not change the existing service definition, and `-Port` can add a second firewall rule. Edit the XML and the firewall rule explicitly after a re-run.

Do not delete `.env` to reset the configuration. A re-run would generate a new `FUNNEL_SECRET`, and the existing GitHub App credentials and OAuth tokens in the database would no longer decrypt.

## 3. Configure `.env`

Edit `C:\ProgramData\Funnel\.env` and set at least the public URL:

```dotenv
FUNNEL_URL=https://funnel.example.com
# FUNNEL_SECRET is already set by the installer. Keep it unchanged.
```

- The generated `FUNNEL_SECRET` is required and must not be changed once the instance is in use. It encrypts GitHub App credentials and OAuth tokens and signs sessions.
- Leave `FUNNEL_URL` blank only for a local-only test. For GitHub OAuth and onboarding, set the exact origin users will browse.
- If the instance is reachable before it has been claimed, add `FUNNEL_ONBOARDING_TOKEN=<token>` to `.env` and restart. Without it, anyone who can reach a fresh instance can complete onboarding.
- For GitHub Enterprise Server, also set both host variables:

```dotenv
GITHUB_URL=https://acme.ghe.com
GITHUB_API_URL=https://acme.ghe.com/api/v3
```

Restart after any change:

```powershell
cd C:\ProgramData\Funnel
.\funnel-service.exe restart
```

`funnel-service.xml` supplies `FUNNEL_DATA_DIR`, `PORT`, `HOST=0.0.0.0`, `LOG_LEVEL` and `BODY_SIZE_LIMIT=25M`. Keep `BODY_SIZE_LIMIT` at least as large as `FUNNEL_UPLOAD_MAX_BYTES` if you use the attachment dropbox. Environment variables in the XML and the `.env` file are read when the process starts.

## 4. Start, stop and restart

From an elevated prompt in the install directory:

```powershell
cd C:\ProgramData\Funnel
.\funnel-service.exe start
.\funnel-service.exe stop
.\funnel-service.exe restart
Get-Service Funnel
```

The service is configured with a 35-second stop timeout, slightly longer than adapter-node's 30-second graceful-shutdown window, so in-flight requests and SSE streams can drain. On failure it restarts after 10 seconds and then 30 seconds. Application logs are JSON on stdout and captured in WinSW's rolled log files in the install directory (10 MB per file, eight files kept).

Start Funnel through the service. Running `funnel.exe` directly from the install directory does not inherit the XML environment, so it would default to `.\data` rather than the service database, and it would conflict with the running service's port. To run it interactively, stop the service first and set `FUNNEL_DATA_DIR=C:\ProgramData\Funnel`.

## 5. Onboard and verify

Open `http://<host>:3000/` (or the port you configured, or your HTTPS URL behind a proxy). A fresh instance sends the browser to `/onboarding`; the health probes still answer. Create and install the GitHub App, then sign in. See [Onboard the GitHub App](../configure/onboard-github-app.md).

Check the probes from the host:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/healthz
Invoke-RestMethod http://127.0.0.1:3000/readyz
```

- `/healthz` returns `200` while the process is alive and does not touch the database.
- `/readyz` returns `503` until the database is reachable and every committed migration is applied; `200` includes `applied` and `expected` counts.
- The executable can probe itself: `.\funnel.exe --healthcheck` requests `http://127.0.0.1:${PORT}/healthz` and exits `0` or `1`. It reads `PORT` from the process environment, not from `funnel-service.xml`; if you changed the port, set `$env:PORT` before running it manually.

## 6. Firewall and port

By default the installer opens the Funnel port for all profiles and the service listens on `0.0.0.0`. Choose the narrower shape that matches your network:

- **Behind a reverse proxy on the same host:** install with `-SkipFirewall`, leave only the proxy's HTTPS port exposed, and optionally edit `funnel-service.xml` to set `<env name="HOST" value="127.0.0.1" />` so Funnel is reachable only from the proxy. Restart afterwards. If a rule was created previously, remove it with `Remove-NetFirewallRule -DisplayName 'Funnel (TCP 3000)'` (adjust the port if you changed it). See [Put Funnel behind a reverse proxy](reverse-proxy.md).
- **Directly exposed:** keep the firewall rule, but restrict its remote address or profile to the network that should reach the cockpit.
- **Changing the port:** edit the `PORT` value in `funnel-service.xml`, update or recreate the firewall rule, then restart. Re-running the installer will not change the existing XML.

Do not put the SQLite data directory on a network share. `LocalSystem` must be able to write the database and uploads locally.

## 7. Upgrade

Upgrading replaces one file; the database and uploads are untouched.

1. Back up the data directory. See [Back up and restore](../operate/backup-and-restore.md).
2. Build the new executable with `mise run exe` and check `.\dist\funnel.exe --version`.
3. Stop the service, replace the executable and start it again:

```powershell
cd C:\ProgramData\Funnel
.\funnel-service.exe stop
Copy-Item C:\path\to\repo\dist\funnel.exe C:\ProgramData\Funnel\funnel.exe -Force
.\funnel-service.exe start
```

Migrations run automatically on boot; watch `/readyz` until it returns `200`.

If you use a custom `-InstallDir`, replace the executable there. Do not copy over a running executable: Windows holds the file open. If the new version fails to start or migrate, restore the backup and the previous executable together; migrations are forward-only. See [Upgrade Funnel](../operate/upgrade.md).

## 8. Uninstall

From an elevated prompt:

```powershell
powershell -ExecutionPolicy Bypass -File packaging\windows\uninstall-service.ps1
```

This stops and unregisters the service and removes firewall rules whose display name starts with `Funnel`. The install directory and data directory are left in place by default.

The destructive switches are opt-in:

- `-RemoveFiles` deletes the install directory.
- `-RemoveData` deletes the data directory when it is different from the install directory.

Because `-DataDir` defaults to `-InstallDir`, `-RemoveFiles` **also deletes the database, uploads and `.env`** on a default install. Back up first. If the WinSW host is missing, the script falls back to `sc.exe delete funnel`.

## Related

- [Environment variables](../../reference/environment-variables.md) — `FUNNEL_DATA_DIR`, `PORT`, `BODY_SIZE_LIMIT` and the rest.
- [Command-line interface](../../reference/cli.md) — `--migrate`, `--healthcheck`, `--version`.
- [Build tasks](../../reference/build-tasks.md) — `mise run exe`, `mise run verify`, `mise run service:install`.
- [Deployment model](../../explanation/deployment-model.md) — the executable, the service and the data directory.
- [Put Funnel behind a reverse proxy](reverse-proxy.md)
- [Use GitHub Enterprise Server](github-enterprise-server.md)
- [Back up and restore](../operate/backup-and-restore.md)
- [Upgrade Funnel](../operate/upgrade.md)
- [Troubleshoot](../operate/troubleshoot.md)
