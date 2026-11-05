---
"funnel": patch
---

Add an optional GitHub webhook receiver at `POST /api/github/webhooks`. The App manifest now subscribes to issue, comment, pull-request, review and check events and registers the hook URL so GitHub generates a webhook secret during onboarding. Deliveries are verified with HMAC-SHA-256 over the raw body, capped at 5 MiB, deduplicated by `x-github-delivery` in the new additive `state_webhook_delivery` table, and refresh only the affected issues (at most 20 per delivery). Polling remains enabled and unchanged as the repair path for missed or deleted events. Settings reports whether a webhook secret is configured, and Apps created before this change can be recreated or reconfigured to opt in.
