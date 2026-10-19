# Upgrade Funnel

Replace the executable or container image, let the forward-only migrations run, and gate traffic on readiness.

## Before you start

- Take a backup of the database, uploads and environment, and confirm you can restore it. See [Back up and restore](backup-and-restore.md).
- Keep the same `FUNNEL_SECRET`. It decrypts the GitHub App credentials and stored OAuth tokens and signs sessions; changing it is not part of an upgrade.
- Schedule a short maintenance window. Funnel is a single instance, so an upgrade is stop-then-start, not a rolling deploy.
- Check free disk space for the database, its WAL sidecars, uploads and migrations.
- Read the release notes for the version you are installing. There is no auto-update mechanism; the operator owns the timing.

## 1. Record the current version

```sh
# Packaged executable
./funnel --version

# Container image
docker run --rm funnel:<old-tag> --version
```

On Windows:

```powershell
C:\ProgramData\Funnel\funnel.exe --version
```

The reported version is embedded from `package.json` at build time. An image tag is only a label, so `--version` is the reliable check that you are running the artifact you think you are.

## 2. Build or pull the new artifact

Choose the path that matches the deployment:

```powershell
# Windows: from the repository root
mise run exe
.\dist\funnel.exe --version
```

```sh
# Container: build or pull
mise run docker --version=1.3.0
# or: docker build -t funnel:1.3.0 .
# or: docker pull registry.example.com/funnel:1.3.0

# Bare-metal Linux: build the executable, or use the release artifact
mise run exe
```

`mise run exe` runs the production build first and writes `dist/funnel` (or `dist\funnel.exe` on Windows). Build on the target OS: cross-compiling requires the target platform's native `satteri` package. See [Build tasks](../../reference/build-tasks.md) and [Deploy with Docker](../deploy/docker.md).

## 3. Optionally apply migrations before starting

Migrations are applied automatically on boot. A separate release phase is useful when you want to see the result before cutover, fail a deploy early, or run migrations without the application's deploy secrets.

Stop the old instance first, then run the **new** artifact against the existing data:

```powershell
# Windows service
cd C:\ProgramData\Funnel
.\funnel-service.exe stop

# Run the new build, not the old installed executable. The packaged
# executable defaults to ./data, so point it at the service data directory.
$env:FUNNEL_DATA_DIR = "C:\ProgramData\Funnel"
C:\path\to\repo\dist\funnel.exe --migrate
```

```sh
# Bare-metal packaged executable
FUNNEL_DATA_DIR=/path/to/data /path/to/new/funnel --migrate

# From a checkout (Bun available)
FUNNEL_DB=/path/to/data/funnel.db mise run release
# or: FUNNEL_DB=/path/to/data/funnel.db bun run release

# Container: same volume as the running instance
docker stop funnel
docker run --rm -v funnel-data:/data funnel:1.3.0 --migrate
```

Why the explicit path for Windows: the service definition sets `FUNNEL_DATA_DIR=C:\ProgramData\Funnel`, but a manually started `funnel.exe` does not inherit the XML environment. Without the variable, the executable defaults to `./data` relative to its working directory, which is the wrong database.

Check the path before running. `--migrate` creates the data directory and database if they do not exist, so a typo silently migrates a new, empty database instead of the live one.

The commands are idempotent and exit `0` when there is nothing to apply. `--migrate` applies migrations and exits without starting the server. `bun run release` is the checkout equivalent; the runtime container has no Bun or source tree, so run the image with `--migrate`. If you skip this step, the boot migration performs the same work for the packaged executable and the container.

Boot migration is a property of the standalone executable. A plain adapter-node deployment started with `bun run start` does not apply migrations on boot, so run `bun run release` (or `mise run release`) against the same `FUNNEL_DB` before starting it.

## 4. Replace the artifact

### Windows service

```powershell
cd C:\ProgramData\Funnel
.\funnel-service.exe stop
Copy-Item C:\path\to\repo\dist\funnel.exe C:\ProgramData\Funnel\funnel.exe -Force
.\funnel-service.exe start
```

The `stop` is safe whether or not you ran the optional migration step. If you use a custom install directory, replace the executable there. Do not copy over a running executable.

### Docker

```sh
docker stop funnel
docker rm funnel

docker run -d --name funnel --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -v funnel-data:/data \
  -e FUNNEL_SECRET='<the existing secret>' \
  -e FUNNEL_URL='https://funnel.example.com' \
  -e BODY_SIZE_LIMIT=25M \
  -e TZ=UTC \
  funnel:1.3.0
```

Keep any other variables from the original run, such as `FUNNEL_ONBOARDING_TOKEN` or a host-specific `TZ`.

With Compose, update the image tag and run `docker compose up -d`. The volume and environment must be the same. Stop the old container before starting the new one.

### Bare metal or PaaS

Stop the old process, replace the binary or deploy the new image, and start one instance. On a PaaS with a release command, run `<image> --migrate` there; otherwise let boot migrate. Do not let the platform start a second replica alongside the old one.

## 5. Wait for readiness

`/healthz` only says the process is alive. Wait for `/readyz`:

```sh
curl -i https://funnel.example.com/readyz
```

A ready instance returns `200`:

```json
{"status":"ready","applied":12,"expected":12}
```

A `503` means it is not ready to serve:

- `{"status":"starting","reason":"database not migrated"}` — the database is unreachable or has no migrations table.
- `{"status":"starting","reason":"migrations pending","applied":10,"expected":12}` — a migration is still pending.

Do not send traffic just because `/healthz` is `200`. The container health check is liveness only; the Windows service and proxy should be verified with `/readyz`. The image's health check has a 20-second start period; a large database can take longer to migrate.

## 6. Verify

- `funnel --version` (or `docker run --rm <image> --version`) reports the version you intended.
- The startup log shows `database ready at ...` and `startup complete`.
- Sign in, open the issue list and board, and upload and download an attachment.
- **Settings → GitHub App** still shows the App as installed.
- The sync logs show successful `repo polled` entries at `LOG_LEVEL=debug`. At the default `info`, look for the absence of `repo poll failed` warnings; a repo that was degraded should clear on its next successful poll or the nightly reconciliation.
- Review the logs at `LOG_LEVEL=info` for `migration failed`, `unhandled request error`, or repeated `repo poll failed`.

If `/readyz` stays at `503`, see [Troubleshoot](troubleshoot.md). Do not repeatedly restart a failing migration; read the first `migration failed` line and fix the cause.

## 7. Roll back

Migrations are forward-only; there is no down-migration command. Running an older binary against a newer schema is not a supported combination.

If the upgrade fails:

1. Stop the new instance.
2. Restore the pre-upgrade database, uploads and environment from the backup. See [Back up and restore](backup-and-restore.md).
3. Start the previous binary or image against that restored data.
4. Wait for `/readyz` and verify sign-in and issue reads.

If you only need to revert the executable and you have verified that the release's migrations are backward compatible, you can swap the binary or image back without restoring. Treat that as an exception, not the default. Never run the old and new versions against the same data directory at the same time.

## 8. Clean up

Keep the previous image or binary and the pre-upgrade backup until the new version has served successfully for a reasonable period. Then remove the stopped container, old image tags and obsolete backups according to your retention policy.

## Related

- [Back up and restore](backup-and-restore.md) — the rollback path.
- [Troubleshoot](troubleshoot.md) — readiness, migration and sync failures.
- [Environment variables](../../reference/environment-variables.md) — `FUNNEL_DB`, `FUNNEL_DATA_DIR`, `FUNNEL_SECRET`.
- [Command-line interface](../../reference/cli.md) — `--migrate`, `--healthcheck`, `--version`.
- [Build tasks](../../reference/build-tasks.md) — `mise run exe`, `mise run docker`, `mise run release`.
- [Deployment model](../../explanation/deployment-model.md) — migrations, readiness and the single instance.
- [Deploy with Docker](../deploy/docker.md)
- [Install as a Windows service](../deploy/windows-service.md)
