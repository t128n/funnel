---
"funnel": patch
---

Show per-repository sync health in Settings → Sync, including the last poll and nightly reconciliation times, a degraded-state banner, and an administrator-only **Sync now** action that runs one cycle and refreshes the table. The last error stays in the sync worker's structured log rather than a new database column.
