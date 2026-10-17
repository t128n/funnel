import type { RequestHandler } from "./$types";

// Better Auth mounts its whole API under `/api/auth/*` — sign-in, the OAuth
// callback (`/api/auth/callback/github`), session, sign-out, and so on. The
// library routes internally, so this single catch-all covers them all.
//
// `svelteKitHandler` in `hooks.server.ts` also dispatches these paths; this
// route is the explicit mount and handles requests the hook does not (e.g.
// when the request origin differs from `auth.options.baseURL`).
//
// `auth` is imported lazily: `auth/index.ts` pulls in `bun:sqlite` via the DB
// layer, which SvelteKit's build-time route analysis (running on Node) cannot
// resolve. Importing inside the handler keeps the DB out of that analysis
// while still mounting the endpoints.
const handler: RequestHandler = async ({ request }) => {
  const { auth } = await import("#lib/server/auth/index");
  return auth.handler(request);
};

export const GET = handler;
export const POST = handler;
