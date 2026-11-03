# Funnel setup — one cross-platform installer

**Goal:** replace the Windows-only PowerShell wizard with a single, polished `funnel setup` command embedded in the self-contained Funnel executable, so Windows, Linux, and macOS share one installation and lifecycle path.
**Architecture:** the existing Bun-compiled `funnel` binary gains an `src/installer/` module and subcommands (`setup`, `status`, `logs`, `uninstall`, `doctor`, `upgrade`). A small service-manager adapter per OS handles systemd, launchd, and WinSW; everything above that — prompts, `.env` creation, secret preservation, paths, health checks, upgrade/uninstall semantics — is shared TypeScript.
**Tech stack:** Bun 1.4.3, TypeScript 6, `@clack/prompts` for the Astro/Vite-style CLI, `cac` for argument parsing, `dotenv` for `FUNNEL_ENV_FILE`, native systemd/launchd/WinSW for services, WinSW 2.12.0 `WinSW.NET461.exe` pinned and embedded, Bun test, GitHub Actions.
**Status:** proposed
**Target release:** `0.1.0` pre-release (minor changeset: the install contract changes)

## Decisions from the interview

- **Platforms:** Windows, Linux, and macOS from day one.
- **Linux init:** systemd only (system and user units).
- **Run mode:** always ask. Offer system service, user service where the OS supports it, or portable process.
- **Config location:** native config directories, not the data directory:
  - Linux system: `/etc/funnel/funnel.env`
  - Linux user: `~/.config/funnel/funnel.env`
  - macOS system: `/Library/Application Support/Funnel/funnel.env`
  - macOS user: `~/Library/Application Support/Funnel/funnel.env`
  - Windows: `C:\ProgramData\Funnel\funnel.env`
- **Elevation:** auto-elevate with `sudo` or UAC, carrying non-secret settings through a temporary config file. The elevated child prompts for secrets again.
- **Lifecycle scope:** full — `setup`, `status`, `logs`, `uninstall`, `doctor`, `upgrade`.
- **Legacy GUI:** remove `setup.ps1`, `install-common.ps1`, `install-service.ps1`, `uninstall-service.ps1`, and the WinSW XML template from the release. Replace `setup.cmd` with a one-line `funnel.exe setup` launcher.
- **Signing:** no credentials yet. Ship unsigned with SHA-256 checksums and GitHub artifact attestations; document SmartScreen/Gatekeeper. Add Authenticode and Apple notarization later.
- **Docker:** out of scope for the installation strategy. Remove Docker from the supported install docs and release narrative; delete the Dockerfile, Docker deployment docs, and `mise run docker`.
- **Windows service wrapper:** WinSW 2.12.0 `WinSW.NET461.exe` (656 KB), pinned by version and SHA-256, embedded in the Funnel binary, and hidden behind a `WindowsServiceManager` interface.

## Non-goals

- No GUI installer. The CLI is the install experience.
- No Docker Compose in this plan.
- No MSI, Inno Setup, NSIS, `.pkg`, `.deb`, or `.rpm` in v1. These can become thin wrappers later if enterprise or package-manager distribution is required.
- No automatic secret rotation.
- No reverse-proxy or TLS configuration.
- No GitHub App creation; that remains the browser onboarding flow.
- No horizontal scaling or multi-instance support.

## Architecture

```text
funnel
  ├─ no args / server flags  -> existing standalone server
  ├─ --version / --help      -> existing CLI
  └─ setup|status|logs|uninstall|doctor|upgrade
       └─ src/installer/
            ├─ cli.ts             cac commands and flags
            ├─ ui.ts              @clack/prompts, spinners, masks
            ├─ paths.ts           OS/mode defaults and overrides
            ├─ config.ts          read/write/backup .env, secret preservation
            ├─ service.ts         ServiceManager interface + shared lifecycle
            ├─ health.ts          /healthz and /readyz polling
            ├─ download.ts        release lookup, checksum verification
            ├─ elevate.ts         sudo/UAC re-exec
            └─ platform/
                 ├─ linux.ts      systemd system/user units
                 ├─ macos.ts      LaunchDaemon/LaunchAgent
                 └─ windows.ts    WinSW service
```

`src/standalone.ts` checks for a known installer subcommand before importing `build/index.js`. The installer must work on a fresh machine with no `FUNNEL_SECRET`, no database, and no `.env`.

## CLI contract

```text
funnel setup [options]
funnel status [--json]
funnel logs [--follow] [--lines <n>]
funnel uninstall [--purge] [--yes]
funnel doctor [--json]
funnel upgrade [--check] [--binary <path>] [--version <version>] [--yes]
```

### `setup` options

| Flag | Meaning |
| :--- | :--- |
| `--mode system\|user\|portable` | Skip the mode prompt. `user` is unavailable on Windows. |
| `--install-dir <path>` | Program/binary directory override. |
| `--config-dir <path>` | Config directory override. |
| `--data-dir <path>` | Data directory override. |
| `--port <n>` | Listen port. Default `3000`. |
| `--host <addr>` | Bind address. Defaults to `0.0.0.0` for services, `127.0.0.1` for portable. |
| `--url <origin>` | Exact public origin for `FUNNEL_URL`; optional. |
| `--onboarding-token <token>` | Optional `FUNNEL_ONBOARDING_TOKEN`. |
| `--log-level <level>` | Default `info`. |
| `--yes` | Non-interactive; required when stdin is not a TTY. |
| `--dry-run` | Print planned actions and generated config (secret masked) without changing anything. |
| `--force` | Replace existing config/service definitions after backups. |
| `--no-elevate` | Do not auto-elevate; print the exact sudo/UAC command. |
| `--json` | Machine-readable output for setup/status/doctor. |
| `--verbose` | Extra diagnostics. |

Exit codes:

- `0` success
- `1` operational failure
- `2` usage/validation
- `3` privilege/elevation required or cancelled
- `4` health check failed
- `5` unsupported platform/init system

### Interactive flow

1. Intro and version.
2. Detect OS, architecture, existing install, and privileges.
3. Ask **How should Funnel run?**
   - Windows: Windows service / Portable.
   - Linux: system service / user service / portable.
   - macOS: system daemon / user agent / portable.
4. Ask install, config, and data directories, pre-filled with native defaults.
5. Ask port, public URL, and optional onboarding token.
6. Show a summary: paths, service mode, URL, existing `.env` handling.
7. Create directories and write `.env` from the embedded template.
8. Install/start the service.
9. Wait for `/healthz`, run `/readyz` as a warning check.
10. Open `http://localhost:<port>/onboarding` or the public URL in the browser.
11. Outro with `status`, `logs`, and `uninstall` hints.

Use `@clack/prompts` `intro`, `select`, `text`, `confirm`, `spinner`, `log`, `note`, and `outro`. Never print `FUNNEL_SECRET` or the onboarding token.

## Platform paths

| | Linux system | Linux user | macOS system | macOS user | Windows system | Windows portable |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Binary | `/usr/local/bin/funnel` | `~/.local/bin/funnel` | `/usr/local/bin/funnel` | `~/.local/bin/funnel` | `%ProgramFiles%\Funnel\funnel.exe` | `%LOCALAPPDATA%\Funnel\funnel.exe` |
| Config | `/etc/funnel/funnel.env` | `~/.config/funnel/funnel.env` | `/Library/Application Support/Funnel/funnel.env` | `~/Library/Application Support/Funnel/funnel.env` | `%ProgramData%\Funnel\funnel.env` | `%LOCALAPPDATA%\Funnel\funnel.env` |
| Data | `/var/lib/funnel` | `~/.local/share/funnel` | `/Library/Application Support/Funnel/data` | `~/Library/Application Support/Funnel/data` | `%ProgramData%\Funnel\data` | `%LOCALAPPDATA%\Funnel\data` |
| Service | `/etc/systemd/system/funnel.service` | `~/.config/systemd/user/funnel.service` | `/Library/LaunchDaemons/io.github.t128n.funnel.plist` | `~/Library/LaunchAgents/io.github.t128n.funnel.plist` | WinSW in `%ProgramFiles%\Funnel` | none |
| Logs | journald | `journalctl --user` | `/Library/Logs/Funnel/` | `~/Library/Logs/Funnel/` | `%ProgramData%\Funnel\logs\` | `%LOCALAPPDATA%\Funnel\logs\` |

Every path can be overridden with the corresponding flag. Use `io.github.t128n.funnel` as the launchd label.

## Configuration and `FUNNEL_ENV_FILE`

The application currently relies on Bun auto-loading `.env` from the working directory. Native config directories require an explicit file. Add:

```dotenv
FUNNEL_ENV_FILE=/etc/funnel/funnel.env
```

- `src/standalone.ts` loads `FUNNEL_ENV_FILE` before `applyDataDefaults()` and before importing `build/index.js` / running migrations.
- Load with `dotenv.config({ path, override: false })`; existing `process.env` wins.
- `--migrate` and `--healthcheck` also load the file.
- The service definition sets only `FUNNEL_ENV_FILE` and `FUNNEL_DATA_DIR`; all other settings live in the env file.
- Portable mode sets `FUNNEL_ENV_FILE` in the spawned process environment.
- Keep Bun's automatic cwd `.env` behavior for development.

The installer writes `funnel.env` from an embedded copy of `.env.example`:

- preserve comments
- generate a 32-byte base64 `FUNNEL_SECRET`
- preserve an existing secret unless `--force`
- back up an existing file as `funnel.env.bak-YYYYMMDD-HHMMSS`
- write UTF-8 without BOM
- set `FUNNEL_DATA_DIR`, `FUNNEL_URL`, `PORT`, `HOST`, `LOG_LEVEL`, optional onboarding token
- permissions: `0600` root or user on Unix; on Windows restrict to SYSTEM/Administrators with `icacls` if possible
- never write `FUNNEL_ENV_FILE` inside the env file itself

## Service adapters

### Interface

```ts
export interface ServiceManager {
  install(config: InstallConfig): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  status(): Promise<ServiceStatus>;
  uninstall(options: { purge: boolean }): Promise<void>;
  logs(options: { follow: boolean; lines: number }): Promise<void>;
}
```

### Linux systemd

System unit:

```ini
[Unit]
Description=Funnel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=funnel
Group=funnel
WorkingDirectory=/var/lib/funnel
Environment=FUNNEL_ENV_FILE=/etc/funnel/funnel.env
ExecStart=/usr/local/bin/funnel
Restart=on-failure
RestartSec=5
TimeoutStopSec=35
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/funnel

[Install]
WantedBy=multi-user.target
```

- Create a system user/group `funnel` with `useradd --system` if missing.
- Install dirs and ownership; config `0600 root:root` or `0640 root:funnel`.
- `systemctl daemon-reload && systemctl enable --now funnel`.
- User unit uses `WantedBy=default.target`; run `loginctl enable-linger "$USER"` for boot without login, and warn if it fails.
- `status` uses `systemctl is-active`, `is-enabled`, and the HTTP probes.
- `logs` uses `journalctl -u funnel` or `journalctl --user -u funnel`.

### macOS launchd

- System mode: `/Library/LaunchDaemons/io.github.t128n.funnel.plist`, runs as a dedicated `_funnel` user if it can be created; otherwise stop with a clear error rather than silently running as root.
- User mode: `~/Library/LaunchAgents/io.github.t128n.funnel.plist`, runs as the installing user.
- Plist keys: `Label`, `ProgramArguments`, `WorkingDirectory`, `EnvironmentVariables` (`FUNNEL_ENV_FILE`, `FUNNEL_DATA_DIR`), `RunAtLoad`, `KeepAlive`, `StandardOutPath`, `StandardErrorPath`, `ProcessType=Background`.
- Load with `launchctl bootstrap system|gui/<uid>`, `enable`, and `kickstart -k`.
- Status with `launchctl print`.
- Logs: tail `/Library/Logs/Funnel/funnel.log` or `~/Library/Logs/Funnel/funnel.log`.
- Uninstall with `launchctl bootout` and remove the plist/binary; keep data unless `--purge`.

### Windows WinSW

- Embed **`WinSW.NET461.exe`** from WinSW 2.12.0 with a pinned SHA-256. Do not download at install time.
- Verify .NET Framework 4.6.1+ (`HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full`, `Release >= 394254`) before relying on it.
- Program files: `%ProgramFiles%\Funnel\funnel.exe`, `funnel-service.exe` (WinSW), `funnel-service.xml`.
- Config/data: `%ProgramData%\Funnel\funnel.env`, `%ProgramData%\Funnel\data`, logs in `%ProgramData%\Funnel\logs`.
- Service XML:
  - executable `%ProgramFiles%\Funnel\funnel.exe`
  - working directory `%ProgramData%\Funnel`
  - `FUNNEL_ENV_FILE=%ProgramData%\Funnel\funnel.env`
  - `FUNNEL_DATA_DIR=%ProgramData%\Funnel\data`
  - delayed auto-start, restart on failure, 35s stop timeout
  - roll-by-size logging
- Service operations through WinSW: `install`, `start`, `stop`, `status`, `uninstall`.
- Firewall: add/remove a rule for the chosen TCP port.
- Service account: LocalSystem for v1; a dedicated least-privilege account is a follow-up hardening item.
- Keep the WinSW dependency behind `WindowsServiceManager`; users never invoke it.

## Elevation

- Unix system/user service:
  - If not root and mode is system, write non-secret settings to a `0600` temp JSON file and re-exec `sudo <current-exe> setup --elevated-config <path>`.
  - The elevated child reads the file, prompts for secrets if needed, performs setup, writes a result file, and exits.
- Windows system service:
  - If not elevated, write non-secret settings to a temp JSON file and spawn `powershell.exe -NoProfile -Command "Start-Process -FilePath '<funnel.exe>' -Verb RunAs -ArgumentList ..."`.
  - Parent waits, propagates exit code, and prints the child result.
- Never pass `FUNNEL_SECRET` or the onboarding token through command-line arguments or the temp config. Generate/prompt secrets in the elevated child.
- `--no-elevate` prints the exact command and exits `3`.

## Lifecycle commands

### `funnel status`

Show mode, version, install path, config path, data path, service status, PID, health, URL, migrations. `--json` for scripts.

### `funnel logs`

- Linux: `journalctl` (system/user).
- macOS: tail the configured launchd log.
- Windows: tail the WinSW log.
- Portable: tail `logs/funnel.log`.
- `--follow` and `--lines`.

### `funnel doctor`

Check:

- config file exists and is readable, secret length >= 32
- data directory exists and is writable
- port is free or the service is healthy
- service is installed/enabled
- `/healthz` and `/readyz`
- version and migration count
- stale `.env.bak-*` and old binary backups
- Windows: WinSW present, .NET Framework version, firewall rule
- Linux: systemd unit present, service user exists
- macOS: launchd label loaded

### `funnel uninstall`

- stop and remove the service
- remove binary, unit/plist/XML, firewall rule
- keep config/data by default
- `--purge` deletes config/data after an explicit confirmation; require `--yes` in non-interactive mode
- print what was kept

### `funnel upgrade`

- `--check`: report current vs latest.
- `--binary <path>`: install a locally downloaded binary (recommended for the private repo).
- `--version <v>` and optional `GITHUB_TOKEN`/`GH_TOKEN`: query the GitHub release API.
- Never persist a token.
- Download to a temp path, verify SHA-256, stop service, back up the current binary, replace, start, health-check, roll back on failure.
- Windows self-replacement: rename the running binary, write the new one, start the service, clean up the old file on the next run.
- Preserve `funnel.env`, `FUNNEL_SECRET`, the database, and uploads.

**Private-repo constraint:** the GitHub repository is private. `funnel upgrade --check` cannot fetch release metadata anonymously. The default supported path is `funnel upgrade --binary <path>`; token-based lookup is optional.

## Dependencies and technology choices

| Dependency / tool | Purpose | Notes |
| :--- | :--- | :--- |
| `@clack/prompts` | Interactive CLI UX | Same family as Astro/Vite-style prompts; works with Bun |
| `cac` | Command/flag parsing and help | Small, already in the lockfile transitively |
| `dotenv` | Load `FUNNEL_ENV_FILE` | `override: false`; no secret logging |
| Bun built-ins | spawn, fs, crypto, fetch, semver | `Bun.semver` for version comparison; no `semver` direct dependency |
| `WinSW.NET461.exe` 2.12.0 | Windows service wrapper | 656 KB, MIT, pinned SHA-256, embedded |
| systemd | Linux service manager | System and user units |
| launchd | macOS service manager | LaunchDaemon/LaunchAgent |
| `@clack/prompts` spinner/log | Progress and errors | Replaces custom PowerShell output |
| GitHub Actions | Cross-platform integration tests | Windows/macOS/Ubuntu runners |
| `actions/attest-build-provenance` | Unsigned-release integrity | Optional but recommended |

Explicitly **not** used: NSSM, `node-windows`, `pm2`, `forever`, `execa`, Docker, MSI/Inno/NSIS, PowerShell for new installs.

## File layout

```text
src/installer/
  cli.ts
  commands/
    setup.ts
    status.ts
    logs.ts
    uninstall.ts
    doctor.ts
    upgrade.ts
  config.ts
  paths.ts
  service.ts
  health.ts
  download.ts
  elevate.ts
  ui.ts
  templates.ts
  platform/
    linux.ts
    macos.ts
    windows.ts
  installer.test.ts
  config.test.ts
  service.test.ts
```

Other changes:

- `src/standalone.ts`: detect installer subcommands; load `FUNNEL_ENV_FILE`.
- `scripts/build-standalone.ts`: embed `WinSW.NET461.exe` and the env/service templates.
- `scripts/fetch-winsw.ts` (new): download WinSW 2.12.0, verify SHA-256, cache for the build.
- `package.json`: add `@clack/prompts`, `cac`, `dotenv`.
- `scripts/package-release.ts`: remove PowerShell installer files from the Windows zip; add `setup.cmd` wrapper; keep `funnel-intake.exe` and `install-intake.ps1`.
- `mise.toml`: remove Docker and PowerShell service tasks; keep `exe`, `verify`, `intake:*`.
- Delete `packaging/windows/install-common.ps1`, `install-service.ps1`, `setup.ps1`, `uninstall-service.ps1`, `funnel-service.xml`; move the service XML into `src/installer/templates.ts`.
- Delete `Dockerfile`, `docs/how-to/deploy/docker.md`, and Docker references from the install docs.
- Add `THIRD_PARTY_NOTICES.md` for WinSW (MIT).

## Implementation phases

### Phase 1 — Environment bootstrap

1. Add `dotenv` and `FUNNEL_ENV_FILE` loading in `src/standalone.ts`.
2. Add `FUNNEL_ENV_FILE` to the environment-variable reference.
3. Ensure `--migrate` and `--healthcheck` honor it.
4. Tests: file parsing, precedence, missing file, quoted values, Windows paths.

**Exit criteria:** an installed service can read `funnel.env` from a native config path.

### Phase 2 — CLI shell

1. Add `@clack/prompts`, `cac`.
2. Add `src/installer/cli.ts` and route subcommands from `src/standalone.ts`.
3. Build the `setup` prompt flow with `--yes`/`--dry-run`.
4. Add `setup.cmd` wrapper.
5. Unit-test path defaults, validation, and non-interactive behavior.

**Exit criteria:** `funnel setup --dry-run` prints a complete plan on all OSes without changing files.

### Phase 3 — Shared config and paths

1. Implement `config.ts`: template substitution, secret generation/preservation, backups, permissions.
2. Implement `paths.ts`: OS/mode defaults and overrides.
3. Embed `.env.example` in the binary.
4. Tests for all path combinations and secret preservation.

**Exit criteria:** `funnel setup --mode portable` writes a valid env file and starts a healthy server on each OS.

### Phase 4 — Linux systemd

1. Implement system/user units and user creation.
2. Install/start/status/logs/uninstall.
3. Integration test on Ubuntu with systemd.

**Exit criteria:** service survives a shell logout; `status`, `logs`, `uninstall` work.

### Phase 5 — macOS launchd

1. Implement LaunchDaemon and LaunchAgent plists.
2. Dedicated `_funnel` user for system mode; user mode without admin.
3. Integration test user mode on macOS; manual test system mode.
4. Logs and uninstall.

**Exit criteria:** LaunchAgent starts at login and the health check passes; system mode installs and uninstalls cleanly.

### Phase 6 — Windows WinSW

1. Add `scripts/fetch-winsw.ts` with pinned version/SHA-256.
2. Embed `WinSW.NET461.exe` in the binary.
3. Implement WinSW XML, install/start/stop/status/uninstall, firewall, logs.
4. Add .NET Framework check.
5. Integration test on Windows runner.

**Exit criteria:** service starts at boot, status/logs/uninstall work, no runtime download.

### Phase 7 — Elevation and lifecycle polish

1. Implement sudo/UAC re-exec with temp config.
2. Implement `status`, `logs`, `doctor`.
3. Implement `uninstall` with `--purge`.
4. Add exit codes and `--json`.

**Exit criteria:** non-admin users can complete system setup via auto-elevation; `doctor` finds a missing secret or service.

### Phase 8 — Upgrade

1. Add raw platform binaries to release assets.
2. Implement checksum verification, stop/replace/start, rollback.
3. Support `--binary` first; token-based GitHub lookup second.
4. Test upgrade from the previous release version.

**Exit criteria:** upgrade preserves config/data/secret and rolls back on a failed health check.

### Phase 9 — Packaging and cleanup

1. Remove PowerShell installer scripts and the WinForms wizard.
2. Update `scripts/package-release.ts` and release README.
3. Remove Docker from the supported install matrix.
4. Update `mise.toml`.
5. Add third-party notices.

**Exit criteria:** Windows zip contains only `funnel.exe`, `funnel-intake.exe`, `install-intake.ps1`, `setup.cmd`, `.env.example`, `README.txt` (plus licenses).

### Phase 10 — Tests, docs, release

1. Add cross-platform CI jobs (portable on all; service on Linux/Windows/macOS where possible).
2. Update docs:
   - `docs/how-to/deploy/install.md`
   - `docs/reference/cli.md`
   - `docs/reference/environment-variables.md`
   - `docs/explanation/deployment-model.md`
   - `docs/how-to/operate/upgrade.md`
   - `docs/how-to/operate/troubleshoot.md`
   - `README.md`
3. Add a changeset (minor → `0.1.0`).
4. Publish a pre-release and run a manual fresh-VM acceptance pass.

## Testing

### Unit

- env template replacement, comments preserved
- secret generation and preservation on `--force`
- backup naming
- path defaults for every OS/mode
- service XML/unit/plist rendering with special characters
- CLI flag validation and exit codes
- version comparison and upgrade asset selection

### Integration

- Portable on Windows, macOS, Ubuntu: `setup --yes --mode portable`, health check, uninstall.
- Linux systemd: `sudo funnel setup --yes --mode system`, `systemctl is-enabled`, health, logs, uninstall.
- Linux user: `funnel setup --yes --mode user`, `systemctl --user`, linger.
- macOS user: LaunchAgent load, health, logs, uninstall.
- macOS system: LaunchDaemon with `_funnel`, health, uninstall (manual if runner restrictions).
- Windows: WinSW service install, health, status, logs, uninstall; no download.
- Upgrade: install previous version, `upgrade --binary`, verify data/secret preservation and rollback.

Use `--dry-run`/`--json` where possible to keep tests deterministic. Always clean up services and temp dirs in `finally`/`always()` steps.

## Release and packaging

- Changesets remains the version source. Target `0.1.0` (minor) because the install contract changes.
- Add raw platform binaries to GitHub release assets for `funnel upgrade --binary` and token-based upgrade.
- Keep `SHA256SUMS.txt`.
- Add artifact attestations for the unsigned release.
- Document SmartScreen and Gatekeeper warnings:
  - Windows: "More info → Run anyway".
  - macOS: `xattr -d com.apple.quarantine ./funnel` if needed.
- Keep the Windows zip lean by removing the PowerShell installer set.
- Keep `funnel-intake.exe` and `install-intake.ps1` as a separate optional per-user helper.
- Remove Docker from the install docs; delete the Dockerfile and Docker deployment docs.

## Backward compatibility and migration

- **Existing Windows PowerShell installs:** detect `%ProgramData%\Funnel\funnel-service.exe`, `funnel-service.xml`, `.env`, and the `funnel` service. Offer to migrate:
  - stop and uninstall the old service
  - copy the new binary to `%ProgramFiles%\Funnel`
  - keep data and `.env`; move/copy `.env` to `funnel.env` with a backup
  - write the new WinSW XML and reinstall the service
  - roll back on failure
- **Existing Linux/macOS tarball installs:** ask for the existing data directory and adopt it; no service to migrate.
- **Portable installs:** detect an existing `funnel.env` and data directory; preserve the secret and offer to keep or replace config.
- Never change `FUNNEL_SECRET` automatically.

## Risks and mitigations

| Risk | Mitigation |
| :--- | :--- |
| WinSW 2.12.0 has no newer release | Pin and embed; verify SHA-256; abstract behind `WindowsServiceManager`; swap to NSSM or a Go shim if needed |
| .NET Framework missing | Check the registry and fail with an actionable message; Windows 10/11/Server 2016+ normally have it |
| UAC/sudo complexity | Temp config without secrets; child re-prompts; `--no-elevate` for automation |
| macOS system user creation | Test `_funnel` creation; fail safely rather than running as root |
| launchd/SIP restrictions | Test user mode automatically; document system-mode manual steps |
| systemd user linger | Enable linger; warn if it fails and document login-only behavior |
| Private release repo | Default `upgrade --binary`; token-based lookup optional |
| Unsigned binaries | Checksums and attestations; documented warnings; add signing later |
| Windows self-replacement | Rename running binary, replace, start, clean up next run; test rollback |
| Port already in use | `doctor` and setup validation; detect an existing Funnel service and allow upgrade |
| Test runner service permissions | Use `--mode portable` in broad CI; run privileged service tests on dedicated jobs |
| Clack on old Windows consoles | Require Windows Terminal or a modern console; document |

## Acceptance criteria

- On a fresh Windows, Linux, and macOS machine, `funnel setup` completes interactively and the onboarding page loads.
- System service starts at boot; user service starts at login; portable mode runs without a service.
- `funnel status`, `logs`, `doctor`, `uninstall`, and `upgrade` work on all three OSes.
- `.env` is created from the embedded template; comments are preserved; the secret is generated and never logged.
- Re-running setup/upgrade preserves the existing `FUNNEL_SECRET` and data; a `.env` backup is created.
- No PowerShell is required for a new install.
- The Windows release zip no longer contains the PowerShell wizard.
- Docker is removed from the supported install story.
- All new behavior is covered by unit tests and at least one integration test per OS.
- Documentation is updated and a `0.1.0` pre-release is published.
