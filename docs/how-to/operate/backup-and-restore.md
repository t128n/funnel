# Back up and restore Funnel

Capture the SQLite database, its WAL sidecars, the uploads directory and the deployment environment as one consistent unit, and restore them in the right order.

## What Funnel stores

| State | Default location | Notes |
| :--- | :--- | :--- |
| SQLite database | `<data-dir>/funnel.db` | Durable state (`state_*`), auth tables (`auth_*`), settings and the disposable mirror. Override with `FUNNEL_DB`. |
| WAL and shared-memory files | `funnel.db-wal`, `funnel.db-shm` next to the database | Present while the database is open in write-ahead log (WAL) mode. They can hold committed transactions not yet checkpointed into `funnel.db`. |
| Attachment bytes | `<data-dir>/uploads/` | Server-generated paths under `<yyyy>/<mm>/<uuid>`. Override with `FUNNEL_UPLOAD_DIR`. Metadata lives in the database. |
| Environment | `.env` in the working directory, or container/PaaS variables | Must preserve `FUNNEL_SECRET`; also `FUNNEL_URL`, the GitHub hosts, and any path overrides. |
| Service definition (optional) | `C:\ProgramData\Funnel\funnel-service.xml` | Port, data directory, `LOG_LEVEL` and `BODY_SIZE_LIMIT` for the Windows service. |

The data directory defaults to `./data` relative to the process working directory. The Windows service sets it to `C:\ProgramData\Funnel` by default; the container sets it to `/data`. If you overrode `FUNNEL_DB` or `FUNNEL_UPLOAD_DIR`, use the actual paths, which may be outside the data directory.

The mirror tables are rebuildable, but they share the database file with durable state. Copy the whole database unless space forces you to dump and exclude `mirror_github_*`; a restored empty mirror simply triggers a full backfill.

`.env` is not present inside the container image. For Docker and PaaS deployments, record the environment separately, especially `FUNNEL_SECRET`.

## 1. Stop the instance for a consistent copy

The simplest consistent backup is taken with the process stopped:

```powershell
# Windows service
cd C:\ProgramData\Funnel
.\funnel-service.exe stop
Get-Service Funnel
```

```sh
# Docker
docker stop funnel
docker ps --filter name=funnel
```

For a bare-metal process, stop it with whatever supervises it (for example `systemctl stop <unit>`).

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

This includes `funnel.db`, its sidecars, `uploads\`, `.env`, the service definition and the executable. If you use a custom data directory, archive that instead and keep the XML separately.

### Linux or a bind-mounted Docker volume

```sh
sudo mkdir -p /backups
sudo tar czf "/backups/funnel-$(date +%F).tar.gz" -C /path/to/data .
```

### Docker named volume

With the container still present (even stopped):

```sh
docker cp funnel:/data ./funnel-data-backup
```

If the container was created with `--rm` and no longer exists, copy the named volume with a helper container after stopping Funnel:

```sh
docker run --rm \
  -v funnel-data:/data \
  -v "$PWD:/backup" \
  debian:stable-slim \
  tar czf /backup/funnel-data.tar.gz -C /data .
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

- Record the Funnel version that produced the backup. Restoring an older database into a newer binary is supported by boot migrations (packaged executable and container) or your release step (adapter-node); restoring a newer database into an older binary is not.

Test a restore periodically, not only when you need one. See [Test the restore](#6-test-the-restore).

## 4. Restore

Restore in this order:

1. **Stop the target instance.** Do not copy a database over a running process.
2. **Move the current data aside.** Rename the data directory (or, at minimum, the database, sidecars and uploads) so you can roll back. On a default Windows service install the data directory is also the install directory: rename it, then restore the replacement at the original path so the registered service path still resolves.

```powershell
Set-Location C:\ProgramData
Rename-Item .\Funnel .\Funnel.before-restore
```

```sh
mv /path/to/data /path/to/data.before-restore
```

3. **Restore the database and its sidecars as a set.** If the backup was a cold copy of the data directory, restore `funnel.db`, `funnel.db-wal` and `funnel.db-shm` together. If the backup has no sidecars (a clean shutdown may have checkpointed and removed them), remove any existing target `-wal` and `-shm` files before starting. If the backup was a single-file online backup, remove any existing `-wal` and `-shm` files before replacing `funnel.db`; a stale WAL from the old database must not be replayed against the restored one.
4. **Restore uploads to the matching root.** Attachment metadata stores paths relative to `FUNNEL_UPLOAD_DIR`. Restore `uploads/` under the same directory the instance will use, or update `FUNNEL_UPLOAD_DIR` to the restored location. Do not move the database without the uploads.
5. **Restore the environment.** Put back the same `FUNNEL_SECRET`, `FUNNEL_URL`, `GITHUB_URL`/`GITHUB_API_URL`, and path overrides. If `FUNNEL_URL` changes, the GitHub App's callback URL may no longer match; update it on GitHub or re-onboard.
6. **Fix ownership.** The instance must be able to write the database, its directory and the uploads. On Linux, `chown -R <service-user>:<service-group> <data-dir>`; the container runs as root by default, and the Windows service runs as `LocalSystem`.
7. **Start the instance.** If the restored database is older than the binary, migrations run on boot or in your release step. Do not start the old and new instances against the same data.
8. **Wait for readiness.** `GET /readyz` must return `200` with matching `applied` and `expected` counts. A `503` means the database is not reachable or migrations are still pending; see [Troubleshoot](troubleshoot.md).
9. **Verify before deleting the old copy.** Sign in, open an issue, download an attachment, and check **Settings → GitHub App** shows the App as installed. Watch the logs for the first successful sync.

For a named Docker volume, restore with Funnel stopped and a helper container:

```sh
docker run --rm \
  -v funnel-data:/data \
  -v "$PWD:/backup" \
  debian:stable-slim \
  tar xzf /backup/funnel-data.tar.gz -C /data
```

Use a fresh volume, or remove the old contents first: extracting over a populated volume can leave stale database sidecars and uploads behind.

If the App credentials fail to decrypt or sign-in loops, the most likely cause is a different `FUNNEL_SECRET`; see the warning below.

## 5. Secret stability

`FUNNEL_SECRET` is not a convenience value. It:

- encrypts the GitHub App's client secret, webhook secret and private key (AES-256-GCM with a key derived by scrypt);
- encrypts stored GitHub OAuth access and refresh tokens through Better Auth;
- signs sessions.

Changing or losing it has immediate consequences:

- the stored GitHub App row cannot be decrypted, so GitHub calls fail and the settings or onboarding page that reads it returns an error;
- stored OAuth tokens cannot be decrypted, so users must sign in again, and some writes may fail until they do;
- existing sessions are invalidated.

Recovery is to restore the original secret. If it is genuinely lost, the settings UI cannot help: reading the App row is what fails, so the instance may error before any page renders. Stop the instance, take a copy of the database, and delete the `state_github_app` row with a SQLite client (or restore a database in which no App row exists), then start and onboard again. Users must sign in again because stored OAuth tokens were encrypted with the old secret. Data in `state_*` and the mirror is not deleted, but the onboarding wizard's repository selection replaces the configured repository list, so re-check **Settings → Repositories**. Restoring a backup together with its secret is preferable to this manual reset.

Store the secret in a password manager or secret manager, and keep the backup archive encrypted with a key stored separately from it.

## 6. Test the restore

Restore into a separate instance, never over production:

1. Use a different data directory and a different `PORT`.
2. Use the same `FUNNEL_SECRET` as the backup.
3. Start the instance and check `/readyz`, the issue list, and an attachment download.
4. Sign-in may fail on a test host because `FUNNEL_URL` does not match the GitHub App's registered callback. That is expected; use the test to validate the database and uploads, or register a test callback URL temporarily.
5. Record how long the restore took and any manual fixes, and keep the procedure with the backups.

## Related

- [Environment variables](../../reference/environment-variables.md) — `FUNNEL_DB`, `FUNNEL_UPLOAD_DIR`, `FUNNEL_DATA_DIR` and `FUNNEL_SECRET`.
- [Command-line interface](../../reference/cli.md) — `--migrate` and `--healthcheck`.
- [Database schema](../../reference/database-schema.md) — which tables are durable and which are rebuildable.
- [Deployment model](../../explanation/deployment-model.md) — the data directory and the secret.
- [Security model](../../explanation/security-model.md) — what `FUNNEL_SECRET` protects.
- [Deploy with Docker](../deploy/docker.md)
- [Install as a Windows service](../deploy/windows-service.md)
- [Upgrade Funnel](upgrade.md)
- [Troubleshoot](troubleshoot.md)
