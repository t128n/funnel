---
"funnel": patch
---

Add configurable attention rules at `/settings/attention` for first response, stale open, re-check and waiting thresholds. Enabled rules surface breaches on `/attention` and notify linked assignees through the existing notification center; `0` disables a rule, defaults preserve existing behaviour, and no schema migration or per-repository overrides are required.
