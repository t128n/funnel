---
"funnel": patch
---

Complete Inbox triage decisions. Accept can set status, labels and assignees; dismiss requires a free-text reason and can be undone; duplicate records its target. Submissions are archived instead of hard-deleted, and an append-only `state_triage_event` table keeps the decision history across archival.
