---
"funnel": patch
---

Add a first-class waiting state for issues parked on the reporter, a vendor or an upstream project. An issue can be marked waiting with a fixed reason, an optional note and re-check date; the state is stored locally in `state_issue_waiting`, keyed by `owner/name` + number, so it survives mirror pruning and never edits the GitHub body. Waiting issues get their own section in Attention, with a stale badge after seven days and one-click clearing, and the Inspector and Inbox gain matching controls and a `waiting=true|false` filter.
