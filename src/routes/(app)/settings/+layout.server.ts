import { requireAdmin, requireUser } from "#lib/server/auth/guard";
import type { LayoutServerLoad } from "./$types";

/**
 * Settings access guard (SPEC §8, RBAC).
 *
 * Every section under `/settings` requires a session; the workspace and system
 * sections additionally require the `admin` role. Only the personal sections
 * (Account, Appearance, Features) are open to `read`/`write`. The nav filters
 * admin sections out by role, but this is the enforcement point: a direct URL
 * still gets a 403.
 */
const PERSONAL_PATHS = new Set([
  "/settings",
  "/settings/appearance",
  "/settings/features",
]);

export const load: LayoutServerLoad = ({ locals, url }) => {
  requireUser(locals, url);
  if (!PERSONAL_PATHS.has(url.pathname)) {
    requireAdmin(locals, url);
  }
  return {};
};
