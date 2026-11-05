# Linux systemd packaging

Funnel ships as a single executable, so a Linux bare-metal install is a binary,
one environment file, and a systemd unit. The automated installer remains the
recommended path; the checked-in unit is for configuration management,
packaging, and manual installs where `funnel setup` should not own the unit.

## Recommended: run the installer

Place the release binary at `/usr/local/bin/funnel`, then run:

```sh
sudo packaging/systemd/install.sh
```

`install.sh` checks that it is running as root and that the binary exists, then
execs the installer with the system-mode defaults:

```sh
/usr/local/bin/funnel setup --mode system --yes \
  --config-file /etc/funnel/funnel.env \
  --data-dir /var/lib/funnel \
  --log-dir /var/log/funnel \
  --port 3000
```

Set `PORT` to choose a different port, or pass a different binary path:

```sh
sudo PORT=8080 packaging/systemd/install.sh /opt/funnel/funnel
```

`funnel setup` creates the `funnel` system user and group, the data/log
directories, the environment file with a generated `FUNNEL_SECRET`, and
`/etc/systemd/system/funnel.service`, then enables and starts the service. The
helper deliberately does not reimplement any of that. Use `funnel setup`
directly if you want interactive prompts or different paths.

## Manual or config-managed: use the template

`funnel.service` mirrors the installer's system-mode defaults (journald
logging), and `funnel.env.example` carries the deployment-relevant environment
keys. A
minimal manual install after creating the service account and directories:

```sh
sudo install -o root -g root -m 0644 packaging/systemd/funnel.service \
  /etc/systemd/system/funnel.service
sudo install -o root -g funnel -m 0640 packaging/systemd/funnel.env.example \
  /etc/funnel/funnel.env
sudoedit /etc/funnel/funnel.env   # set FUNNEL_URL and FUNNEL_SECRET
sudo systemctl daemon-reload
sudo systemctl enable --now funnel
```

The unit allows a missing environment file with
`EnvironmentFile=-/etc/funnel/funnel.env`, but Funnel still needs a readable
`FUNNEL_SECRET` in that file or in the process environment. If you change the
binary path, data directory, or log directory, update the unit as well as the
environment file. Keep any custom paths in `ReadWritePaths`; otherwise
`ProtectSystem=strict` makes them read-only to the service.

See [Install Funnel on Linux with systemd](../../docs/how-to/deploy/linux-systemd.md)
for the full guide: prerequisites, service-account setup, configuration,
reverse proxy and firewall, health checks, upgrades, backups, uninstall, and
troubleshooting.

## Files

| File | Purpose |
| :--- | :--- |
| `funnel.service` | Static system unit for `/usr/local/bin/funnel` and `/var/lib/funnel`. |
| `funnel.env.example` | Environment template for `/etc/funnel/funnel.env`. |
| `install.sh` | Root-only helper that runs `funnel setup --mode system`. |
