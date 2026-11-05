---
"funnel": patch
---

Add Inbox snooze/defer for staged submissions and untriaged issues. A snooze hides a row until a resurface time and automatically returns it when due; issues are keyed by `owner/name` plus number so snoozes survive mirror pruning and re-sync. The Snoozed view offers resurface, the queue badge excludes snoozed rows, and triage or a status change clears the snooze.
