import { building } from "$app/env";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { auth } from "#lib/server/auth/index";
import { provisionCanonicalLabels } from "#lib/server/github/labels";
import { createLogger } from "#lib/server/log";
import { scheduleReconciliation } from "#lib/server/sync/reconcile";
import { startSyncWorker } from "#lib/server/sync/worker";
import type { Handle, ServerInit } from "@sveltejs/kit/hooks";

const log = createLogger({ component: "startup" });

/**
 * Startup self-healing label provisioning (SPEC §5.2(4)). Runs before the
 * server answers its first request. `provisionCanonicalLabels` swallows all
 * errors, so an unreachable GitHub or missing config logs a warning instead
 * of blocking or crashing startup. Skipped during `vite build`/prerender.
 *
 * The sync worker and nightly reconciliation timer are then started
 * fire-and-forget so startup is never blocked by a backfill; both rely on the
 * long-lived adapter-node process (SPEC §3.1).
 */
export const init: ServerInit = async () => {
  if (building) return;
  const startedAt = Date.now();
  const report = await provisionCanonicalLabels();
  log.info(
    {
      repos: report.repos.length,
      created: report.created,
      updated: report.updated,
      failed: report.failed,
      durationMs: Date.now() - startedAt,
    },
    "startup complete",
  );
  startSyncWorker();
  scheduleReconciliation();
};

export const handle: Handle = async ({ event, resolve }) => {
  // Populate `event.locals` once per request so `load` functions and actions
  // can read the session without re-resolving it. Better Auth's handler still
  // owns the `/api/auth/*` routes via `svelteKitHandler` below.
  if (!building) {
    const session = await auth.api.getSession({
      headers: event.request.headers,
    });
    event.locals.session = session?.session ?? null;
    event.locals.user = session?.user ?? null;
  }
  return svelteKitHandler({ auth, event, resolve, building });
};
