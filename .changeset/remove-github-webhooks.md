---
"funnel": patch
---

Make Funnel polling-only. Remove the inbound GitHub webhook receiver, its manifest hook and event subscriptions, the generated webhook secret, the `state_webhook_delivery` table, and the `FUNNEL_GITHUB_WEBHOOKS` opt-in. Onboarding no longer depends on GitHub being able to reach the server, and polling remains the single sync path.
