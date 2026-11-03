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

Download the platform binary from the GitHub release. The repository is private,
so releases are not anonymously downloadable. The supported upgrade path is a
local file:

```sh
funnel upgrade --binary /path/to/funnel
```

`funnel upgrade --check` prints the current version and the expected path.

## 3. Let boot migration run

`funnel upgrade` stops the service, keeps a backup of the previous binary,
installs the new one, starts it, and waits for `/healthz`. Migrations are applied
automatically on boot by the standalone executable.

For an explicit pre-flight migration, stop the service and run the new binary
against the same config:

```sh
# Linux/macOS service
sudo systemctl stop funnel
sudo -u funnel /path/to/new/funnel --migrate

# Windows service
cd C:\ProgramData\Funnel
.\funnel-service.exe stop
$env:FUNNEL_ENV_FILE = "C:\ProgramData\Funnel\funnel.env"
C:\path\to\new\funnel.exe --migrate
```

Use the configured `FUNNEL_ENV_FILE`; a manually started binary does not inherit
the service environment. Check the path before running: `--migrate` creates a
new empty database if the path is wrong.

`--migrate` is idempotent and exits `0` when there is nothing to apply. The
packaged executable also migrates on boot, so the separate step is optional.

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

1. Stop the new instance.
2. Restore the pre-upgrade database, uploads, and environment from the backup.
3. Start the previous binary against that restored data.
4. Wait for `/readyz` and verify sign-in and issue reads.

If you only need to revert the executable and the release's migrations are
backward compatible, swap the binary back. Treat that as an exception, not the
default. Never run the old and new versions against the same data directory at
the same time.

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
