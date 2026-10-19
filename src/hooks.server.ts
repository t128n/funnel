import { building } from "$app/env";
import { redirect } from "@sveltejs/kit";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { getAuth } from "#lib/server/auth/index";
import { provisionCanonicalLabels } from "#lib/server/github/labels";
import { createLogger } from "#lib/server/log";
import { scheduleReconciliation } from "#lib/server/sync/reconcile";
import { startSyncWorker } from "#lib/server/sync/worker";
import type { Handle, ServerInit } from "@sveltejs/kit/hooks";

const log = createLogger({ component: "startup" });

/**
 * Startup self-healing label provisioning (SPEC §5.2(4)). Runs before the
 * server answers its first request. `provisionCanonicalLabels` swallows all
 * errors, so an unreachable GitHub, a missing App (fresh, un-onboarded
 * instance), or missing config logs a warning instead of blocking or crashing
 * startup. Skipped during `vite build`/prerender.
 *
 * The sync worker and nightly reconciliation timer are then started
 * fire-and-forget so startup is never blocked by a backfill; both rely on the
 * long-lived adapter-node process (SPEC §3.1) and are no-ops until onboarding
 * has created the App and repositories are configured.
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

/**
 * Paths the first-run gate never redirects. `/onboarding` is the wizard
 * itself, `/_app` and asset-looking paths (a dot in the last segment) are the
 * page's own bundle, `/api/auth` must reach its handler (which answers 503
 * while unconfigured rather than serving the wizard), and the health probes
 * must answer for a process supervisor / load balancer even on a fresh
 * instance (the packaged executable is health-checked before anyone onboards).
 */
function isOnboardingExempt(pathname: string): boolean {
  if (pathname === "/onboarding" || pathname.startsWith("/onboarding/")) {
    return true;
  }
  if (pathname === "/healthz" || pathname === "/readyz") return true;
  if (pathname === "/_app" || pathname.startsWith("/_app/")) return true;
  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) {
    return true;
  }
  const lastSegment = pathname.slice(pathname.lastIndexOf("/") + 1);
  return lastSegment.includes(".");
}

export const handle: Handle = async ({ event, resolve }) => {
  if (building) return resolve(event);

  // Populate `event.locals` once per request so `load` functions and actions
  // can read the session without re-resolving it. `getAuth()` is `null` until
  // onboarding has created the GitHub App.
  const auth = await getAuth();
  if (auth) {
    const session = await auth.api.getSession({
      headers: event.request.headers,
    });
    event.locals.session = session?.session ?? null;
    event.locals.user = session?.user ?? null;
  } else {
    event.locals.session = null;
    event.locals.user = null;
  }

  // First-run gate: an unconfigured instance can only reach the wizard.
  if (!auth && !isOnboardingExempt(event.url.pathname)) {
    throw redirect(303, "/onboarding");
  }

  // Better Auth owns `/api/auth/*`; when unconfigured that route answers 503.
  if (auth) {
    return svelteKitHandler({ auth, event, resolve, building });
  }
  return resolve(event);
};
