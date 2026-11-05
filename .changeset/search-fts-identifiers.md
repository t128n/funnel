---
"funnel": patch
---

Add FTS5 issue search over titles, bodies and comments, with `#123`/`FIT-123`/`owner/repo#123` identifiers and constraining `is:`, `label:`, `repo:`, `status:` and `assignee:` qualifiers in the shared `q` parameter. The index is maintained by the mirror write path and backfilled by an additive migration.
