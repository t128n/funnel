---
"funnel": patch
---

Mirror GitHub issue types (Bug/Feature/Task) into the disposable `mirror_thread.issue_type` column through a separate fail-soft GraphQL query. The issue Inspector shows the type, the issue lists can filter by type (including untyped) and group by type, and quick-create offers a Type select when the selected repository supports it. Unsupported hosts/repos keep syncing and creating issues normally, and a rejected type write never turns a successful create into a failure.
