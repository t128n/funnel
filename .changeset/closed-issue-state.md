---
"funnel": patch
---

Fix issue hydration so closed issues are mirrored as closed. `AssignedEvent.assignee` and `UnassignedEvent.assignee` are the `Assignee` union, so selecting `login`/`avatarUrl` directly made GitHub reject the entire timeline hydration query. Every poll then failed before writing the new issue state, leaving closed issues reported as open indefinitely. The query now selects each union member through an inline fragment, with a regression test that pins the union-safe query shape.
