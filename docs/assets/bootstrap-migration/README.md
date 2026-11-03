# Bootstrap migration captures

Before/after evidence for the migration from the custom Tailwind/shadcn-svelte
design system to Bootstrap 5, Sveltestrap, and Bootstrap Icons.

- `before/` — `main` before this migration, using the t128n component layer.
- `after/` — the migrated tree.

Each view uses the same seeded demo database and a 1440×900 viewport at DPR 1.
Light captures: issues, issue, inbox, board, plan, matrix, timeline, settings
planning, intake. Dark captures: issues, issue, board, plan, settings planning.

Regenerate the "after" set:

```sh
COOKIE="$(bun scripts/screenshots/seed.ts --out /tmp/funnel-shots)"
FUNNEL_DB=/tmp/funnel-shots/funnel.db \
FUNNEL_SECRET=funnel-screenshots-secret-0123456789abcdef \
bun run dev --port 5180

# capture with Playwright at 1440×900 after setting funnel:theme=light|dark
```

The committed gallery is PR evidence, not a source of truth. The conventions
live in [DESIGN.md](../../DESIGN.md); the Bootstrap variables and layout classes
live in [`src/lib/styles/app.css`](../../../src/lib/styles/app.css).
