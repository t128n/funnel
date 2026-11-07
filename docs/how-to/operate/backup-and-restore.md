# Back up and restore Funnel

Capture the SQLite database, its WAL sidecars, the uploads directory and the deployment environment as one consistent unit, and restore them in the right order.

## What Funnel stores

| State | Default location | Notes |
| :--- | :--- | :--- |
| SQLite database | `<data-dir>/funnel.db` | Durable state (`state_*`), auth tables (`auth_*`), settings and the disposable mirror. Override with `FUNNEL_DB`. |
| WAL and shared-memory files | `funnel.db-wal`, `funnel.db-shm` next to the database | Present while the database is open in write-ahead log (WAL) mode. They can hold committed transactions not yet checkpointed into `funnel.db`. |
| Attachment bytes | `<data-dir>/uploads/` | Server-generated paths under `<yyyy>/<mm>/<uuid>`. Override with `FUNNEL_UPLOAD_DIR`. Metadata lives in the database. |
| Environment | The config file written by `funnel setup` (`FUNNEL_ENV_FILE`) | Must preserve `FUNNEL_SECRET`; also `FUNNEL_URL`, the GitHub hosts, and any path overrides. |
| Service definition (optional) | `C:\Program Files\Funnel\funnel-service.xml` | The generated Windows service XML passes `FUNNEL_ENV_FILE` and `FUNNEL_DATA_DIR`; other settings come from the environment file. |

The data directory defaults to `./data` relative to the process working directory. The native installer sets platform defaults (`C:\ProgramData\Funnel\data` on Windows, `/var/lib/funnel` on Linux system installs, and the chosen macOS path). Use the paths recorded in `funnel status`.

The mirror tables are rebuildable, but they share the database file with durable state. Copy the whole database unless space forces you to dump and exclude `mirror_github_*`; a restored empty mirror simply triggers a full backfill.

Record the config file separately from the data directory, especially `FUNNEL_SECRET`.

## 1. Stop the instance for a consistent copy

The simplest consistent backup is taken with the process stopped:

```powershell
# Windows service
Stop-Service Funnel
Get-Service Funnel
```

**Result:** `Get-Service` reports `Stopped`. Run PowerShell as administrator if needed. For a native service, stop it with the service manager (`systemctl stop funnel`, `launchctl bootout`, or `funnel-service.exe stop`). For a bare-metal process, stop it with whatever supervises it.

Stopping matters because:

- SQLite in WAL mode may hold committed pages in `funnel.db-wal`; copying only `funnel.db` while the process runs can lose the newest writes.
- Uploads can be written while you copy them, so the database metadata and the files on disk can disagree.

If you cannot stop the instance, back up the database with SQLite's online backup mechanism rather than a plain file copy:

```sh
sqlite3 /path/to/funnel.db ".backup '/backups/funnel.db'"
```

Then copy `uploads/`. This keeps the database internally consistent, but the uploads copy can still be slightly behind the metadata; a file uploaded during the copy may have a row but no stored bytes. For a small self-hosted instance, stopping is the safer default.

## 2. Copy the data and the environment

### Windows

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
New-Item -ItemType Directory -Force -Path C:\Backups | Out-Null
Compress-Archive -Path C:\ProgramData\Funnel\* `
  -DestinationPath "C:\Backups\Funnel-$stamp.zip"
```

With default Windows service paths this includes `data\funnel.db`, any sidecars, `data\uploads\`, and `funnel.env`. The service XML and executable are under `C:\Program Files\Funnel` and are not included. **Result:** the ZIP exists under `C:\Backups`; inspect its contents in step 3. If paths were customised or `FUNNEL_DB` or `FUNNEL_UPLOAD_DIR` overrides them, separately copy those locations and the config file.

### Linux or macOS

```sh
sudo mkdir -p /backups
sudo tar czf "/backups/funnel-$(date +%F).tar.gz" -C /path/to/data .
```

### Protect the archive

The database contains encrypted App secrets and OAuth tokens, but the `.env` or service variables contain the `FUNNEL_SECRET` that decrypts them. An archive holding both is as sensitive as the secret itself. Encrypt it with your standard tooling, restrict access, and store a copy off the host.

Keep the secret recoverable. A backup you cannot decrypt is not a backup.

## 3. Verify the backup

- List the archive and confirm it contains `funnel.db`, any `funnel.db-wal`/`funnel.db-shm` files, `uploads/`, and the environment file or a recorded copy of the variables.
- If you used the online backup, run an integrity check:

```sh
sqlite3 /backups/funnel.db "PRAGMA integrity_check;"
```

`ok` is the expected result.

- Record the Funnel version that produced the backup. Restoring an older database into a newer binary is supported by boot migrations (packaged executable) or your release step (adapter-node); restoring a newer database into an older binary is not.

Test a restore periodically, not only when you need one. See [Test the restore](#6-test-the-restore).

## 4. Restore

Restore in this order:

1. **Stop the target instance.** Do not copy a database over a running process.
2. **Move the current data aside.** Rename the data directory (or, at minimum, the database, sidecars and uploads) so you can roll back. On a default Windows service install the data directory is `C:\ProgramData\Funnel\data`; the installed binary is separate under `C:\Program Files\Funnel`.

```powershell
Set-Location C:\ProgramData\Funnel
Rename-Item .\data .\data.before-restore
```

```sh
mv /path/to/data /path/to/data.before-restore
```

3. **Restore the database and its sidecars as a set.** If the backup was a cold copy of the data directory, restore `funnel.db`, `funnel.db-wal` and `funnel.db-shm` together. If the backup has no sidecars (a clean shutdown may have checkpointed and removed them), remove any existing target `-wal` and `-shm` files before starting. If the backup was a single-file online backup, remove any existing `-wal` and `-shm` files before replacing `funnel.db`; a stale WAL from the old database must not be replayed against the restored one.
4. **Restore uploads to the matching root.** Attachment metadata stores paths relative to `FUNNEL_UPLOAD_DIR`. Restore `uploads/` under the same directory the instance will use, or update `FUNNEL_UPLOAD_DIR` to the restored location. Do not move the database without the uploads.
5. **Restore the environment.** Put back the same `FUNNEL_SECRET`, `FUNNEL_URL`, `GITHUB_URL`/`GITHUB_API_URL`, and path overrides. If `FUNNEL_URL` changes, the GitHub App's callback URL may no longer match; update it on GitHub or re-onboard.
6. **Fix ownership.** The instance must be able to write the database, its directory and the uploads. On Linux, `chown -R <service-user>:<service-group> <data-dir>`; the Windows service runs as `LocalSystem`.
7. **Start the instance.** If the restored database is older than the binary, migrations run on boot or in your release step. Do not start the old and new instances against the same data.
8. **Wait for readiness.** `GET /readyz` must return `200` with matching `applied` and `expected` counts. A `503` means the database is not reachable or migrations are still pending; see [Troubleshoot](troubleshoot.md).
9. **Verify before deleting the old copy.** Sign in, open an issue, download an attachment, and check **Settings → GitHub App** shows the App as installed. Watch the logs for the first successful sync.

If the App credentials fail to decrypt or sign-in loops, the most likely cause is a different `FUNNEL_SECRET`; see the warning below.

## 5. Secret stability

`FUNNEL_SECRET` is not a convenience value. It:

- encrypts the GitHub App's client secret and private key (AES-256-GCM with a key derived by scrypt);
- encrypts stored GitHub OAuth access and refresh tokens through Better Auth;
- signs sessions.

Changing or losing it has immediate consequences:

- the stored GitHub App row cannot be decrypted, so GitHub calls fail and the settings or onboarding page that reads it returns an error;
- stored OAuth tokens cannot be decrypted, so users must sign in again, and some writes may fail until they do;
- existing sessions are invalidated.

Recovery is to restore the original secret. If it is genuinely lost, the settings UI cannot help: reading the App row is what fails, so the instance may error before any page renders. Stop the instance, take a copy of the database, and delete the `state_github_app` row with a SQLite client (or restore a database in which no App row exists), then start and onboard again. Users must sign in again because stored OAuth tokens were encrypted with the old secret. Data in `state_*` and the mirror is not deleted, but the onboarding wizard's repository selection replaces the configured repository list, so re-check **Settings → Repositories**. Restoring a backup together with its secret is preferable to this manual reset.

Store the secret in a password manager or secret manager, and keep the backup archive encrypted with a key stored separately from it.

## 6. Test the restore

A restored database contains the production GitHub App credentials and configured repositories. A separate data directory or port does **not** prevent background sync or label provisioning from contacting production GitHub. Never start the copy with network access to production GitHub or GHES.

1. Prepare a separate test machine or isolated VM with network egress blocked by the host or network firewall **before** starting Funnel. Deny outbound access to GitHub or GHES, including API hosts and any HTTP proxy that could reach them; an isolated network with no external route is preferable. Allow only the local access needed to inspect the test. Do not rely on changing `GITHUB_URL`: the restored App host is stored in the database.

   **Result:** from the test environment, attempts to reach the production GitHub web and API hosts fail. Confirm the firewall or network policy covers the actual route and proxy settings; do not proceed if isolation cannot be established. A failed connectivity test alone does not prove all routes are blocked.

2. Restore the backup to a separate data directory and configure a different port, the same `FUNNEL_SECRET`, and paths that cannot point to production files. Protect the test copy and secret as production-sensitive data.

   **Result:** the restored database, uploads and config are present in the isolated location, and no process is using the production data directory.

3. Start the test instance while isolation remains in force, then check its local `/readyz`.

   **Result:** readiness returns HTTP 200 with matching migration counts. GitHub sync or authentication errors are expected while access is blocked; readiness does not prove GitHub connectivity.

4. Verify the database and attachment files against the backup using local inspection. Browser sign-in and authenticated attachment download may be unavailable without GitHub OAuth; do not change the production App callback or reconnect the copied production credentials just to complete this test. For end-to-end sign-in, sync, or download testing, use a separately provisioned test instance and test GitHub App with non-production repositories and credentials.

   **Result:** record what was verified offline and any checks deferred to the separate test instance. Do not claim an authenticated download succeeded unless it actually did.

5. Stop the test instance before changing isolation or removing the test copy. Record the Funnel version, restore outcome, duration and any manual fixes with the backup procedure.

   **Result:** the copied instance is no longer running and cannot contact production GitHub after isolation is lifted.

## Related

- [Environment variables](../../reference/environment-variables.md) — `FUNNEL_DB`, `FUNNEL_UPLOAD_DIR`, `FUNNEL_DATA_DIR` and `FUNNEL_SECRET`.
- [Command-line interface](../../reference/cli.md) — `--migrate` and `--healthcheck`.
- [Database schema](../../reference/database-schema.md) — which tables are durable and which are rebuildable.
- [Deployment model](../../explanation/deployment-model.md) — the data directory and the secret.
- [Security model](../../explanation/security-model.md) — what `FUNNEL_SECRET` protects.
- [Install Funnel](../deploy/install.md)
- [Upgrade Funnel](upgrade.md)
- [Troubleshoot](troubleshoot.md)
