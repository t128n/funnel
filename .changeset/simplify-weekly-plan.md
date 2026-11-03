---
"funnel": patch
---

Simplify weekly planning and remove the daily planner. `/plan` is now a conventional Bootstrap document with a page heading, previous/next week buttons, a capacity table, a scheduled-issues table, an unassigned section only when relevant, and an unestimated table with an **Estimate** action. The old lane/progress-bar composition and the `/day`, availability, day-plan and calendar-feed surfaces are removed. The four legacy daily-planning tables remain in existing databases but are no longer read or written.
