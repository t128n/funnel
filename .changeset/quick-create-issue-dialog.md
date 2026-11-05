---
"funnel": patch
---

Add an in-app quick-create issue dialog. `C` and the board columns' **New Issue** control now open a dialog with repository, title, description, status, impact, urgency, size, assignee and non-reserved label fields; creating posts through the existing issue API, refreshes the cockpit, and shows a confirmation with the GitHub link. `/intake` remains the external submission path.
