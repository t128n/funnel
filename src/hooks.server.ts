import { building } from "$app/env";
import { FUNNEL_DB } from "$app/env/private";
import { redirect } from "@sveltejs/kit";
import { svelteKitHandler } from "better-auth/svelte-kit";
import {
  getAuth,
  resetAuthCache,
  type Session,
} from "#lib/server/auth/index";
import { resetConfigCache } from "#lib/server/config";
import { runMigrations } from "#lib/server/db/release";
import { isDemoMode } from "#lib/server/demo/mode";
import { getDemoAuth, seedDemoDatabase } from "#lib/server/demo/seed";
import { provisionCanonicalLabels } from "#lib/server/github/labels";
import { createLogger } from "#lib/server/log";
import { scheduleReconciliation } from "#lib/server/sync/reconcile";
import { startSyncWorker } from "#lib/server/sync/worker";
import type {
  Handle,
  HandleServerError,
  ServerInit,
} from "@sveltejs/kit/hooks";

const log = createLogger({ component: "startup" });
const httpLog = createLogger({ component: "http" });

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

  // Demo mode owns startup: migrate and seed the demo database, then skip the
  // three GitHub-contacting steps below. A seed failure throws so a broken
  // demo is visible instead of silently serving an empty cockpit.
  if (isDemoMode()) {
    runMigrations({ dbPath: FUNNEL_DB });
    seedDemoDatabase();
    resetConfigCache();
    resetAuthCache();
    log.info("demo ready");
    return;
  }

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

/**
 * The full Better Auth session shape for the seeded demo admin.
 *
 * Demo requests never resolve a cookie: the same admin is signed in on every
 * request, which also means sign-out cannot end the demo session. The
 * placeholders (`emailVerified`, audit dates, `ipAddress`, ...) satisfy the
 * layout's session type; nothing reads them for authorization beyond `role`.
 */
function demoSession(): {
  user: Session["user"];
  session: Session["session"];
} {
  const seeded = getDemoAuth();
  if (!seeded) throw new Error("Demo session requested before the seed ran");
  const now = new Date();
  const user = {
    id: seeded.user.id,
    name: seeded.user.name,
    email: seeded.user.email,
    emailVerified: true,
    image: seeded.user.image,
    createdAt: now,
    updatedAt: now,
    role: seeded.user.role,
    banned: false,
    banReason: null,
    banExpires: null,
  } as Session["user"];
  const session = {
    id: seeded.session.id,
    token: seeded.session.token,
    userId: seeded.session.userId,
    expiresAt: new Date(seeded.session.expiresAt),
    createdAt: now,
    updatedAt: now,
    ipAddress: null,
    userAgent: null,
    impersonatedBy: null,
  } as Session["session"];
  return { user, session };
}

export const handle: Handle = async ({ event, resolve }) => {
  if (building) return resolve(event);

  // A correlation id per request, threaded through `locals` so `handleError`
  // and any server log line can reference the same failure.
  event.locals.requestId = crypto.randomUUID();

  // Populate `event.locals` once per request so `load` functions and actions
  // can read the session without re-resolving it. `getAuth()` is `null` until
  // onboarding has created the GitHub App. In demo mode the seeded admin is
  // applied before (and instead of) the Better Auth lookup.
  const auth = await getAuth();
  if (isDemoMode()) {
    const demo = demoSession();
    event.locals.session = demo.session;
    event.locals.user = demo.user;
  } else if (auth) {
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
    const response = await svelteKitHandler({ auth, event, resolve, building });
    return withCrawlHeaders(response);
  }
  return withCrawlHeaders(await resolve(event));
};

/**
 * Keep this private instance out of search indexes. `robots.txt` and the
 * `<meta name="robots">` tags cover it, but a response header is the one signal
 * that can't be stripped by a page that renders outside the app template.
 */
function withCrawlHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** HTTP status of a caught error, for the correct log level. */
function caughtStatus(error: unknown, kind: string): number {
  if (kind === "unknown") return 500;
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  return 500;
}

/**
 * Uniform error handling (SPEC §10.2).
 *
 * Expected failures (a 404 from a `load`, a `redirect`-adjacent `error(403)`)
 * are logged at `warn`; anything unexpected (an unhandled throw, a database
 * failure) is logged at `error` with the full stack and a stable correlation
 * id. The client never sees an unexpected error's message — only the generic
 * copy plus that id, so upstream text and internals stay server-side.
 */
export const handleError: HandleServerError = ({ kind, error, event }) => {
  const status = caughtStatus(error, kind);
  const requestId = event.locals.requestId;
  const fields = {
    requestId,
    method: event.request.method,
    path: event.url.pathname,
    kind,
    status,
  };

  if (kind === "unknown") {
    httpLog.error({ ...fields, err: error }, "unhandled request error");
    return {
      message: "Something went wrong on our end. Please try again.",
      id: requestId,
    };
  }

  if (status >= 500) {
    httpLog.error({ ...fields, err: error }, "request failed");
  } else {
    httpLog.warn(fields, "request rejected");
  }

  // Inherit the caught error's status/message (expected errors are safe).
  return {};
};
