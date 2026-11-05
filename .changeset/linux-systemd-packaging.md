---
"funnel": patch
---

Add a supported Linux bare-metal path alongside `funnel setup`: a checked-in
systemd unit and environment template under `packaging/systemd/`, a root-only
`install.sh` helper that delegates to the existing wizard, and a how-to covering
service-account setup, config, reverse proxy, health probes, upgrades, backups,
uninstall, hardening, and troubleshooting. The automated wizard remains the
recommended installer.
