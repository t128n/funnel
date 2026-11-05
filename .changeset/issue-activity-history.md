---
"funnel": patch
---

Add a unified issue activity history. GitHub timeline events (labels, assignments, close/reopen, references, mentions, renames and milestones) are mirrored from the existing batched hydration query inside the configured history window, while Funnel also records local priority, label and assignee changes alongside the existing status/state/blocked log. The issue Activity section gains All, Comments and History filters, merged in chronological order without duplicating comments or showing the same change twice, and intake-accepted issues show a "Created from intake" entry.
