# Install Funnel on Linux with systemd

This guide shows you how to run Funnel as a systemd system service on a Linux
host. The cross-platform `funnel setup` wizard is the recommended installer. Use
the checked-in unit and environment templates when Ansible, Nix, a configuration
management system, or a manual process should own the unit instead of the
wizard.

For the interactive installer and the lifecycle commands, see
[Install Funnel](install.md). This page adds the Linux bare-metal details.

## Before you start

- A Linux host with systemd, and root or sudo access for the system service.
- The release binary for your architecture. Linux release binaries target glibc;
  they are not static musl builds.
- Outbound HTTPS to `github.com` and `api.github.com`, or to your GitHub
  Enterprise Server host. Funnel uses it for the GitHub App, OAuth, and sync.
- A DNS name and TLS certificate if the instance is public. Terminate TLS at a
  reverse proxy; Funnel itself serves HTTP.
- Funnel is a **single instance**. One process owns one SQLite database and one
  uploads directory. Do not start a second process against the same data
  directory, and do not scale the service horizontally.

The examples use the installer defaults: the `funnel` service account,
`/usr/local/bin/funnel`, `/etc/funnel/funnel.env`, `/var/lib/funnel`, and
`/var/log/funnel`. Change every path consistently if you use different ones.

## 1. Create the service account and directories

Skip this step if you use `install.sh` or `funnel setup`: the wizard creates the
account and directories for system mode. For a manual or template install,
create them first:

```sh
getent group funnel >/dev/null || sudo groupadd --system funnel
id -u funnel >/dev/null 2>&1 || sudo useradd \
  --system \
  --gid funnel \
  --no-create-home \
  --home-dir /var/lib/funnel \
  --shell /usr/sbin/nologin \
  funnel

sudo install -d -o funnel -g funnel -m 0750 /var/lib/funnel /var/log/funnel
sudo install -d -o root -g funnel -m 0750 /etc/funnel
```

The service runs as `funnel:funnel` and needs write access only to the data and
log directories. The environment file is readable by the `funnel` group but not
world-readable.

## 2. Install the binary

Extract the release archive and place the executable on `PATH`:

```sh
tar -xzf funnel-<version>-linux-x64.tar.gz
sudo install -o root -g root -m 0755 funnel /usr/local/bin/funnel
/usr/local/bin/funnel --version
```

`funnel setup` copies the running binary to the configured install directory.
The manual template expects it at `/usr/local/bin/funnel`; if you use another
path, update `ExecStart` in the unit.

## 3. Install the service

### Recommended: run the installer helper

From a Funnel checkout, with the binary already installed:

```sh
sudo packaging/systemd/install.sh
```

The helper verifies that it is running as root and that the binary is
executable, then execs the installer:

```sh
/usr/local/bin/funnel setup --mode system --yes \
  --config-file /etc/funnel/funnel.env \
  --data-dir /var/lib/funnel \
  --log-dir /var/log/funnel \
  --port 3000
```

Choose a different port or binary path with:

```sh
sudo PORT=8080 packaging/systemd/install.sh /opt/funnel/funnel
```

`funnel setup` creates the service account and directories, writes the
configuration from the embedded template with a generated `FUNNEL_SECRET`,
installs `/etc/systemd/system/funnel.service`, and enables and starts the unit.
It also writes `/etc/funnel/install.json`, which `funnel status`, `logs`,
`doctor`, `upgrade`, and `uninstall` use.

Because the helper passes explicit data and log paths, setup selects file
logging when systemd supports it: the generated unit writes to
`/var/log/funnel/funnel.log` and `funnel-error.log` instead of the journal. The
checked-in template uses journald. In both cases, `funnel logs` follows the
active source.

If the configuration file already exists, setup preserves it and does not
replace its `FUNNEL_SECRET`; use `--force` only when you intend to back up and
replace it.

### Manual or config-managed: use the checked-in templates

Install the unit and environment template, then edit the config:

```sh
sudo install -o root -g root -m 0644 packaging/systemd/funnel.service \
  /etc/systemd/system/funnel.service
sudo install -o root -g funnel -m 0640 packaging/systemd/funnel.env.example \
  /etc/funnel/funnel.env
sudoedit /etc/funnel/funnel.env
sudo systemctl daemon-reload
sudo systemctl enable --now funnel
```

At minimum, set `FUNNEL_URL` and `FUNNEL_SECRET` in
`/etc/funnel/funnel.env`. Generate the secret with:

```sh
openssl rand -base64 32
```

The unit uses `EnvironmentFile=-/etc/funnel/funnel.env` (the leading `-` allows
the file to be missing) and also sets `FUNNEL_ENV_FILE` and `FUNNEL_DATA_DIR`
explicitly. The packaged executable loads `FUNNEL_ENV_FILE` itself, so the file
works even where systemd's environment loader is not in play.

If you change the data directory, log directory, or binary path, update the
unit as well. Keep custom data and log paths in `ReadWritePaths`; otherwise
`ProtectSystem=strict` makes them read-only to the service. This manual path
does not create `/etc/funnel/install.json`, so the `funnel` lifecycle commands
are unavailable; manage the service with `systemctl` and replace the binary
yourself during upgrades.

## 4. Check the configuration

| Variable | Value | Notes |
| :--- | :--- | :--- |
| `FUNNEL_URL` | `https://funnel.example.com` | Exact public origin, no trailing slash or path. Set it before onboarding so the GitHub App callback URLs are registered correctly. Empty means "use the request origin". |
| `FUNNEL_SECRET` | 32+ characters | Encrypts the GitHub App credentials and OAuth tokens and signs sessions. Keep it stable and back it up separately. |
| `FUNNEL_DATA_DIR` | `/var/lib/funnel` | Holds `funnel.db` and `uploads/`. Must match the unit's `WorkingDirectory` and be covered by `ReadWritePaths`. |
| `FUNNEL_ENV_FILE` | `/etc/funnel/funnel.env` | Loaded by the packaged executable. Keep it in sync with the unit's `EnvironmentFile`. |
| `PORT` | `3000` | Listen port. Must match the reverse proxy and any firewall rule. |
| `HOST` | `0.0.0.0` | Bind address. Behind a proxy on the same host, `127.0.0.1` is safer. |

Do not change `FUNNEL_SECRET` after onboarding. Losing it makes the stored App
credentials and OAuth tokens undecryptable. See
[Back up and restore](../operate/backup-and-restore.md#5-secret-stability).

## 5. Put a reverse proxy in front

For a public instance, set the public origin and trust the proxy's forwarded
headers in `/etc/funnel/funnel.env`:

```dotenv
FUNNEL_URL=https://funnel.example.com
PROTOCOL_HEADER=x-forwarded-proto
HOST_HEADER=x-forwarded-host
HOST=127.0.0.1
```

Configure nginx, Caddy, or another proxy to send `X-Forwarded-Proto` and
`X-Forwarded-Host`, disable buffering for `GET /api/events`, and raise the body
limit above `FUNNEL_UPLOAD_MAX_BYTES`. The complete nginx and Caddy examples are
in [Put Funnel behind a reverse proxy](reverse-proxy.md).

In the firewall, expose only the proxy ports, normally `80` and `443`. Keep the
Funnel port (`3000` by default) on loopback or a private interface:

```sh
sudo ufw allow 'Nginx Full'
# Do not allow 3000/tcp from untrusted networks.
```

## 6. Verify the service

```sh
sudo systemctl status funnel
sudo journalctl -u funnel -n 100 --no-pager
curl -fsS http://127.0.0.1:3000/healthz
curl -i http://127.0.0.1:3000/readyz
```

- `/healthz` is liveness: it returns `200` with
  `{"status":"ok","service":"funnel"}` whenever the process is alive. It does
  not touch the database or GitHub.
- `/readyz` is readiness: it returns `200` with `applied` and `expected`
  migration counts when the database is migrated. It returns `503` while the
  database is unreachable or migrations are pending. A `503` here is not a
  proxy problem.

The installer also provides lifecycle checks:

```sh
sudo funnel status
sudo funnel logs --follow
sudo funnel doctor
```

`funnel logs` follows the journal or the configured log files, depending on the
install mode. When the unit logs to journald, `journalctl -u funnel` is
equivalent. With file logging, check `/var/log/funnel/funnel.log` and
`/var/log/funnel/funnel-error.log`; `journalctl` then shows only systemd's
start/stop messages and early failures.

## 7. Upgrades, backups, and uninstall

### Upgrade

Download the new Linux binary, then let the installer replace it:

```sh
sudo funnel upgrade --binary /path/to/funnel
```

The command stops the service, keeps a backup of the previous binary, installs
the new one, starts it, and rolls back if `/healthz` fails. Migrations run on
boot. Wait for `/readyz` before sending traffic. For a manual template install
without `install.json`, stop the unit, replace `/usr/local/bin/funnel`, and
start it again, keeping a copy of the old binary.

See [Upgrade Funnel](../operate/upgrade.md).

### Back up

Stop the service, then copy the database, uploads, and configuration together:

```sh
sudo systemctl stop funnel
sudo tar czf "/backups/funnel-$(date +%F).tar.gz" \
  /etc/funnel /var/lib/funnel
sudo systemctl start funnel
```

The config contains `FUNNEL_SECRET`; the archive is as sensitive as the secret.
Encrypt it and keep a copy off the host. For an online backup, use SQLite's
`.backup` instead of copying a running database. See
[Back up and restore](../operate/backup-and-restore.md).

### Uninstall

With an installer-created manifest:

```sh
sudo funnel uninstall            # stop/remove the unit and binary; keep config, data, logs
sudo funnel uninstall --purge --yes
```

`--purge` also deletes the configuration, database, uploads, and logs. The
service definition and executable are removed either way. For a manual template
install, run `sudo systemctl disable --now funnel`, remove
`/etc/systemd/system/funnel.service`, and delete the paths you created yourself.

## 8. Systemd hardening

The unit is deliberately conservative and should work on the systemd baseline
supported by the installer:

- `User=funnel`, `Group=funnel` — the service never runs as root.
- `NoNewPrivileges=true` — the process cannot gain privileges through setuid
  binaries.
- `PrivateTmp=true` — the service gets a private `/tmp`.
- `ProtectSystem=strict` — the filesystem is mounted read-only for the service,
  including `/usr` and `/etc`.
- `ProtectHome=true` — `/home`, `/root`, and `/run/user` are inaccessible.
- `ReadWritePaths=/var/lib/funnel /var/log/funnel` — the only writable paths.

If you move data or logs outside those directories, add them to
`ReadWritePaths`. A drop-in is usually cleaner than editing the packaged unit:

```sh
sudo systemctl edit funnel
```

```ini
[Service]
ReadWritePaths=/srv/funnel/data /srv/funnel/logs
```

Also set `FUNNEL_DATA_DIR` and any `FUNNEL_UPLOAD_DIR` or `FUNNEL_DB` overrides
in the environment file. A path that the service can read but not write
eventually fails at the first database write or upload.

The template does not use newer systemd directives. It writes to journald by
default; the installer adds `StandardOutput=append:` and `StandardError=append:`
only when file logging is selected and systemd v240 or newer is detected.

## 9. Troubleshooting

### The unit fails with "Address already in use"

Find the listener and reconcile the port:

```sh
sudo ss -ltnp | grep ':3000'
sudo journalctl -u funnel -n 50 --no-pager
```

Change `PORT` in `/etc/funnel/funnel.env` (and the reverse proxy and firewall
rule), then restart the service. If another Funnel instance or an old process
owns the port, stop it first. Do not run two instances against one data
directory.

### Permission denied on the data directory

```sh
sudo chown -R funnel:funnel /var/lib/funnel /var/log/funnel
sudo namei -l /var/lib/funnel/funnel.db
sudo -u funnel test -w /var/lib/funnel && echo writable
```

Check that the environment file is readable by the service group:

```sh
sudo ls -l /etc/funnel/funnel.env     # root:funnel, mode 0640
```

For custom paths, confirm they are in `ReadWritePaths` and in
`FUNNEL_DATA_DIR`/`FUNNEL_DB`/`FUNNEL_UPLOAD_DIR`. `funnel doctor` reports
config, directory, service, and health problems together.

### Every intake request shares one rate-limit bucket

Funnel's intake rate limiter uses SvelteKit's client address. Behind a reverse
proxy that address is the proxy unless adapter-node is told which header to
trust. Add these to `/etc/funnel/funnel.env`:

```dotenv
ADDRESS_HEADER=x-forwarded-for
XFF_DEPTH=1
```

Make sure the proxy overwrites `X-Forwarded-For` (`$proxy_add_x_forwarded_for`
in nginx), and raise `XFF_DEPTH` only for a chain of trusted proxies. If Funnel
is reachable directly, do not trust a forwarded header: a client could choose
its own bucket. See
[the intake lifecycle](../../explanation/intake-lifecycle.md).

### `/readyz` stays at 503

Read the response body and the startup log:

```sh
curl -i http://127.0.0.1:3000/readyz
sudo journalctl -u funnel -n 100 --no-pager
```

`{"status":"starting","reason":"database not migrated"}` means the database is
unreachable or has no migrations table.
`{"status":"starting","reason":"migrations pending","applied":N,"expected":M}`
means migrations are still pending. Run the migration step with the service
environment and the same data path:

```sh
sudo systemctl stop funnel
sudo -u funnel env FUNNEL_ENV_FILE=/etc/funnel/funnel.env \
  /usr/local/bin/funnel --migrate
sudo systemctl start funnel
```

Check that `/var/lib/funnel` is writable by `funnel` and has free space. Do not
point `FUNNEL_DB` at a different file from the one the service uses; a relative
path resolves from the unit's `WorkingDirectory`. Once `/readyz` returns `200`,
traffic can be sent. See [Troubleshoot](../operate/troubleshoot.md#readyz-returns-503).

## Related

- [Install Funnel](install.md) — the cross-platform wizard and lifecycle commands.
- [Linux systemd packaging](../../../packaging/systemd/README.md) — the checked-in unit, environment template, and helper.
- [Put Funnel behind a reverse proxy](reverse-proxy.md)
- [Back up and restore](../operate/backup-and-restore.md)
- [Upgrade Funnel](../operate/upgrade.md)
- [Troubleshoot](../operate/troubleshoot.md)
- [Environment variables](../../reference/environment-variables.md)
- [Command-line interface](../../reference/cli.md)
