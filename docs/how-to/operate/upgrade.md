# Upgrade Funnel

Upgrade in place with `funnel upgrade --binary`, let the forward-only migrations
run, and gate traffic on readiness.

## Before you start

- Take a backup of the database, uploads, and environment, and confirm you can
  restore it. See [Back up and restore](backup-and-restore.md).
- Keep the same `FUNNEL_SECRET`. It decrypts the GitHub App credentials and
  stored OAuth tokens and signs sessions; changing it is not part of an upgrade.
- Schedule a short maintenance window. Funnel is a single instance, so an
  upgrade is stop-then-start, not a rolling deploy.
- Read the release notes. There is no automatic update feed; the operator owns
  the timing.
- **Automatic rollback risk:** if an upgrade fails after the old binary was moved, the command attempts to restore and restart that binary immediately, even if the new binary already migrated the database. It does not restore the database. Running the old binary against that schema is unsupported. The command has no documented option to prevent this restart. Take a verified backup first; if that automatic restart is unacceptable, use a controlled manual stop, replacement, and start instead, with no automatic restart of the old version. See [Roll back](#6-roll-back).

## 1. Record the current version

```sh
funnel status
# or: funnel --version
```

On Windows:

```powershell
.\funnel.exe status
```

The reported version is embedded at build time.

## 2. Download the new binary

1. Download the matching archive from the [GitHub releases listing](https://github.com/t128n/funnel/releases), selecting a suitable release (including prereleases where appropriate), and extract it to a separate directory.

   **Result:** the new executable is available separately from the installed binary. `funnel upgrade --check` reports the current version; add `--json` to include the installed binary path. Its private-repository message is outdated and it does not look up releases.

2. Run the extracted executable as the CLI and also supply it as the source. This keeps the running CLI separate from the installed executable it replaces. Use an elevated terminal if required for the installation. For example, in PowerShell in the extracted Windows folder:

   ```powershell
   .\funnel.exe upgrade --binary .\funnel.exe
   ```

   On Linux or macOS, use `/path/to/extracted/funnel upgrade --binary /path/to/extracted/funnel`. The CLI discovers default installation manifests independently of its own location. For a custom config location, or to select the intended installation when more than one exists, add `--manifest <path-to-install.json>`. The source must be a different file from the installed binary.

   **Result:** the command reports the upgraded version and previous binary backup path after starting the replacement and checking `/healthz`.

### Alternative: controlled manual replacement

If automatically restarting an old binary on a potentially migrated database is unacceptable, do not run `upgrade --binary`. Schedule downtime and use the appropriate service manager instead:

1. Stop the instance and verify it has stopped. For a Windows service, use elevated PowerShell `Stop-Service Funnel` and check `Get-Service Funnel` reports `Stopped`. For portable mode, stop the actual process using the supervisor or process manager. Confirm no other instance uses the data.
2. Take and verify the [backup](backup-and-restore.md) while stopped. Record the installed binary path from `status` before stopping or from the installation manifest. Keep a separate copy of the old executable.
3. Replace the installed executable with the extracted new executable using the host's file-management tools. Leave the service definition, config, data and uploads in place. **Result:** the installed binary's `--version` reports the intended version; if replacement fails, do not start it until the cause is resolved.
4. Start the service or process with its normal manager, then check health, readiness and logs below. **Result:** readiness returns 200 with matching migration counts. If startup or readiness fails, stop the instance and restore the matching pre-upgrade data and old executable as described in [Roll back](#6-roll-back); do not restart the old executable against possibly migrated data.

Manual replacement bypasses the upgrade command's manifest version update: `funnel status` may continue to report the old version. Verify the installed binary with `--version` instead, and account for the stale manifest when using lifecycle commands. On Windows, file locks or service recovery settings may require additional operator intervention; verify the process is stopped before replacing files.

## 3. Check migration and recovery

The standalone executable applies migrations on boot. Upgrade attempts to restore and immediately restart the previous **binary** if its health check fails, but it cannot undo a migration. An older binary against a newer schema is not supported; stop the instance and restore the pre-upgrade database, uploads, and matching environment before starting the old version. See [Roll back](#6-roll-back).

If an explicit pre-flight migration is necessary, first stop the instance using its actual service manager (systemd on Linux, launchd on macOS, or Windows Services), verify it has stopped, and back up the data. Run the new binary as the service account with `FUNNEL_ENV_FILE` set to the actual config. Verify its database path first: a wrong path can create an empty database. The command is `funnel --migrate` (Windows: `funnel.exe --migrate`); exit code 0 indicates success, including when no migrations were pending. Restart using the same service manager and check readiness below.

## 4. Wait for readiness

`/healthz` only says the process is alive. Wait for `/readyz`:

```sh
curl -i https://funnel.example.com/readyz
```

A ready instance returns `200`:

```json
{"status":"ready","applied":12,"expected":12}
```

A `503` means it is not ready to serve:

- `{"status":"starting","reason":"database not migrated"}` — the database is
  unreachable or has no migrations table.
- `{"status":"starting","reason":"migrations pending","applied":10,"expected":12}` —
  a migration is still pending.

Do not send traffic just because `/healthz` is `200`.

## 5. Verify

- `funnel status` reports the intended version and a running service.
- The startup log shows `database ready at ...` and `startup complete`.
- Sign in, open the issue list and board, and upload/download an attachment.
- **Settings → GitHub App** still shows the App as installed.
- The sync logs show successful `repo polled` entries at `LOG_LEVEL=debug`; at
  the default `info`, look for the absence of `repo poll failed` warnings.
- Review the logs for `migration failed`, `unhandled request error`, or repeated
  `repo poll failed`.

If `/readyz` stays at `503`, see [Troubleshoot](troubleshoot.md). Do not
repeatedly restart a failing migration; read the first `migration failed` line.

## 6. Roll back

Migrations are forward-only; there is no down-migration command. Running an
older binary against a newer schema is not supported.

If the upgrade fails:

1. Stop whichever instance is running immediately, including an automatically restarted previous binary. Confirm it has stopped before restoring anything.
2. Restore the pre-upgrade database, uploads, and environment from the backup.
3. Start the previous binary against that restored data.
4. Wait for `/readyz` and verify sign-in and issue reads.

Do not assume a binary-only rollback is safe: the automatic rollback does not reverse migrations. Never run the old and new versions against the same data directory at the same time.

`funnel upgrade` keeps the previous binary as `<binary>.bak-<timestamp>`; remove
it after the new version has served successfully.

## Related

- [Back up and restore](backup-and-restore.md) — the rollback path.
- [Troubleshoot](troubleshoot.md) — readiness, migration and sync failures.
- [Environment variables](../../reference/environment-variables.md) —
  `FUNNEL_ENV_FILE`, `FUNNEL_DATA_DIR`, `FUNNEL_SECRET`.
- [Command-line interface](../../reference/cli.md) — `status`, `upgrade`,
  `--migrate`, `--healthcheck`.
- [Deployment model](../../explanation/deployment-model.md) — migrations,
  readiness and the single instance.
- [Install Funnel](../deploy/install.md)
