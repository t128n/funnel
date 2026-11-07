# Install Funnel

Funnel ships as one self-contained executable per platform. The same binary is
the server and the installer: run `funnel setup` to create the configuration,
install the native service, and open the first-run wizard.

![Illustrative Funnel setup prompt flow; current prompts vary by platform and version](../../assets/setup/funnel-setup.png)

The [animated preview](../../assets/setup/funnel-setup.gif) illustrates the
prompt flow. It was recorded from an earlier build, so treat it as an
illustration rather than a verification of the current release; the text
above is authoritative.

## Requirements

| Platform | Requirements |
| :--- | :--- |
| Windows | Windows 10 1903+ or Windows 11 / Server 2016+. The executable installs a WinSW service; .NET Framework 4.6.1+ is part of supported Windows versions. |
| Linux | systemd (system or user units). The release binary targets glibc. |
| macOS | launchd. System installs use a dedicated `_funnel` user; user installs use a LaunchAgent. |
| Network | Outbound HTTPS to GitHub (or your GitHub Enterprise host) for the App manifest and sync. |

Funnel is a **single instance**. It owns one SQLite database and one uploads
directory. Do not run two instances against the same data directory.

## Install

1. Download the matching archive and `SHA256SUMS.txt` from the [GitHub releases listing](https://github.com/t128n/funnel/releases); select a suitable release, including a prerelease if appropriate. The published 0.0.12 prerelease includes `funnel-0.0.12-windows-x64.zip` and `SHA256SUMS.txt`.

   **Result:** both files are in your downloads folder.

2. Verify the archive before running it. On Windows, in PowerShell from the download folder:

   ```powershell
   Get-FileHash .\funnel-<version>-windows-x64.zip -Algorithm SHA256
   ```

   **Result:** the displayed hash matches the archive's line in `SHA256SUMS.txt`. On Linux, run `sha256sum -c --ignore-missing SHA256SUMS.txt`; on macOS, compare `shasum -a 256 <archive>` with the same line. If the hash differs, delete the download and download it again; do not run it.

3. Extract the archive completely.

   **Result:** the extracted folder contains the executable and `.env.example`; the Windows ZIP also contains `funnel-service.exe` and a launcher (`setup.cmd` in 0.0.12; current packaging uses `START-HERE.cmd`).

4. On Linux or macOS, open a terminal in the extracted folder and run:

   ```sh
   ./funnel setup
   ```

   On Windows, open PowerShell in the extracted folder and run:

   ```powershell
   .\funnel.exe setup
   ```

   Alternatively, double-click the launcher included in your ZIP (`setup.cmd` or `START-HERE.cmd`). **Result:** the setup prompts appear.

5. Choose **Windows service** on Windows, or **System service** on Linux/macOS (starts at boot and needs administrator/sudo), **User service** (Linux/macOS only), or **Portable process** (no service). Choose the paths, port, optional public URL, and optional onboarding token. Defaults are available for each path.

   **Result:** setup prints `Funnel is running:` and the onboarding URL, and attempts to open it. A readiness warning means you should check again before proceeding.

6. Run `funnel status` (Windows: `.\funnel.exe status` from the extracted folder).

   **Result:** the service or process is running and health and readiness checks are OK. For custom configuration paths, supply `--manifest <path-to-install.json>`. Continue with [GitHub App onboarding](../configure/onboard-github-app.md); if checks fail, see [troubleshooting](../operate/troubleshoot.md).

For automation on Linux, for example:

```sh
funnel setup --yes \
  --mode system \
  --config-file /etc/funnel/funnel.env \
  --data-dir /var/lib/funnel \
  --log-dir /var/log/funnel \
  --port 3000
```

Windows example with data on another drive:

```powershell
.\funnel.exe setup --config-file D:\Data\Funnel\funnel.env --data-dir D:\Data\Funnel\data --log-dir D:\Data\Funnel\Logs
```

### What setup writes

- The config file from the embedded `.env.example`.
- A generated `FUNNEL_SECRET`, preserved on re-runs.
- A backup of an existing config before replacement.
- `install.json` next to the config, with the non-secret install metadata used
  by `status`, `logs`, `doctor`, `uninstall`, and `upgrade`.
- A native service definition (systemd unit, launchd plist, or WinSW XML).

The service passes `FUNNEL_ENV_FILE` to the executable. Funnel loads that file
before validation and migrations; `FUNNEL_DATA_DIR` points at the data
directory.

## Default paths

| | Linux system | Linux user | macOS system | macOS user | Windows system | Windows portable |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Binary | `/usr/local/bin` | `~/.local/bin` | `/usr/local/bin` | `~/.local/bin` | `%ProgramFiles%\Funnel` | `%LOCALAPPDATA%\Funnel` |
| Config | `/etc/funnel/funnel.env` | `~/.config/funnel/funnel.env` | `/Library/Application Support/Funnel/funnel.env` | `~/Library/Application Support/Funnel/funnel.env` | `%ProgramData%\Funnel\funnel.env` | `%LOCALAPPDATA%\Funnel\funnel.env` |
| Data | `/var/lib/funnel` | `~/.local/share/funnel` | `/Library/Application Support/Funnel/data` | `~/Library/Application Support/Funnel/data` | `%ProgramData%\Funnel\data` | `%LOCALAPPDATA%\Funnel\data` |
| Logs | `/var/log/funnel` | `~/.local/state/funnel/logs` | `/Library/Logs/Funnel` | `~/Library/Logs/Funnel` | `%ProgramData%\Funnel\logs` | `%LOCALAPPDATA%\Funnel\logs` |

These are defaults only. The interactive setup and the `--install-dir`,
`--config-file`, `--data-dir`, and `--log-dir` flags override them.

## After setup

Open the onboarding URL printed by the wizard. Funnel's first-run gate sends
every route to `/onboarding` until a GitHub App exists. The wizard creates the
App through GitHub's Manifest Flow, installs it, and lets you choose
repositories. The first account to sign in becomes `admin`.

Set `FUNNEL_URL` to the exact public origin when the instance is behind a
reverse proxy or reached by a hostname. Direct HTTP installs work without it.

## Lifecycle

```sh
funnel status          # service state, health, readiness, paths
funnel logs            # journald, launchd log, or WinSW log
funnel logs --follow
funnel doctor          # config, secret, dirs, service, health
funnel uninstall       # stop/remove the service; keep config/data
funnel uninstall --purge --yes
```

### Upgrade

Download and extract the new platform archive from the [releases listing](https://github.com/t128n/funnel/releases). Back up the database, uploads, and secret first. The upgrade command needs a local binary; `--check` reports the current version but does not look up releases (its private-repository message is outdated).

**Warning:** on failure, upgrade may automatically restart the previous binary even after the new binary has migrated the database. This is not a safe database rollback. For the separate-CLI invocation, recovery procedure, and an alternative when automatic restart is unacceptable, see [Upgrade Funnel](../operate/upgrade.md).

## Platform notes

### Windows

`funnel setup` installs a WinSW 2.12.0 service. WinSW is shipped with the release
and hidden behind the Funnel CLI; do not invoke it directly. The service uses
`%ProgramData%\Funnel` for configuration/data/logs and `%ProgramFiles%\Funnel`
for the executable. Setup adds a firewall rule for the chosen port.

### Linux

System mode creates a `funnel` system user and a systemd unit. User mode writes
a user unit and enables lingering so it can start without an interactive login;
if lingering is unavailable, the service starts at login instead.

For a manual or configuration-managed install, `packaging/systemd/` contains a
system unit, an environment template, and a root-only `install.sh` helper. See
[Install Funnel on Linux with systemd](linux-systemd.md) for the bare-metal
walkthrough, including service-account setup, hardening, health checks, and
troubleshooting. The wizard remains the recommended path.

### macOS

System mode writes a LaunchDaemon and runs as `_funnel`. User mode writes a
LaunchAgent under the current account. Logs are written to
`/Library/Logs/Funnel` or `~/Library/Logs/Funnel`.

## Reverse proxy

Set the exact public origin and trust the proxy headers:

```dotenv
FUNNEL_URL=https://funnel.example.com
PROTOCOL_HEADER=x-forwarded-proto
HOST_HEADER=x-forwarded-host
```

See [Put Funnel behind a reverse proxy](reverse-proxy.md).

## Related

- [Put Funnel behind a reverse proxy](reverse-proxy.md)
- [Use GitHub Enterprise Server](github-enterprise-server.md)
- [Back up and restore](../operate/backup-and-restore.md)
- [Upgrade Funnel](../operate/upgrade.md)
- [Command-line interface](../../reference/cli.md)
- [Environment variables](../../reference/environment-variables.md)
