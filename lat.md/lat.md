# Funnel knowledge graph

Funnel is a self-hosted GitHub issue cockpit built as a single Bun/SvelteKit process over a local SQLite mirror. These documents record its architecture, domain model, and the decisions behind them.

Behavior is grounded in current source and tests; inferred rationale and unresolved decisions are collected in [[open-questions]].

## Index

Start with the architecture overview, then follow the domain area you need.

- [[architecture]] — process model, request lifecycle, configuration, and deployment shape.
- [[sync]] — how the disposable mirror is polled, hydrated, repaired, and broadcast.
- [[workflow]] — labels as workflow state, derived priority, views, filters, and writes.
- [[intake]] — the public intake queue, abuse controls, and triage decisions.
- [[planning]] — weekly plans, capacity, observed actuals, delays, epics, and the timeline.
- [[attention]] — blocked work, waiting, snoozes, rule breaches, notifications, and insights.
- [[security]] — roles, sessions, GitHub authority, encrypted credentials, and public surfaces.
- [[operations]] — deployment, migrations, health probes, packaging, demo mode, and flags.
- [[ui]] — cockpit routes, URL state, feed stores, optimistic overlays, and realtime updates.
- [[testing]] — the test harness, fixtures, coverage gate, and test layers.
- [[open-questions]] — confidence levels, inferred intent, resolved decisions, and the remaining retention question.
