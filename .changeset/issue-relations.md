---
"funnel": patch
---

Mirror GitHub parent/sub-issue and blocked-by/blocking relationships in the new disposable `mirror_issue_relation` table. Hydration uses two separate fail-soft GraphQL queries so a GitHub Enterprise host that rejects sub-issues or dependencies keeps its previously stored edges and never fails the issue sync. The issue Inspector now shows the parent, sub-issue progress computed from the mirrored children, and blocked-by/blocking lists, kept visually separate from Funnel's manual blocked flag. Each query keeps at most 100 edges per issue, and the main hydration query is unchanged.
