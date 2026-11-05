---
"funnel": patch
---

Add multi-select and bulk triage to the issue streams and the Inbox. Rows gain checkboxes (plus Space on the focused checkbox and `x` on a focused row), with select-all for the loaded window and a compact action bar. Issues support bulk status, impact/urgency, size, assignee, label and snooze changes; staged submissions support bulk dismiss with the required reason and bulk snooze. Writes reuse the existing per-item paths through a bounded three-at-a-time runner, so partial failures are reported with the failing references while successful writes stay applied. Selection is keyed by `owner/name#number` and submission id, survives SSE refreshes, and clears after a successful action or navigation.
