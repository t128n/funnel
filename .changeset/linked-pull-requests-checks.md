---
"funnel": patch
---

Mirror the pull requests linked to an issue, with open/draft/merged/closed state, reviewer verdicts, and the head commit's check rollup. The issue detail gains a compact Development panel, while list rows and board cards show a small PR/check indicator. Two opt-in Sync settings can move an open issue to In Review when a PR opens and close it when every linked PR is merged or closed. The GitHub App manifest now requests `pull_requests: read` and `checks: read`; existing installations must approve the added permissions.
