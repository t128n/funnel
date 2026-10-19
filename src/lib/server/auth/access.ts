/**
 * Better Auth admin-plugin access control for Funnel's three roles.
 *
 * The plugin derives its `role` union from `roles` and validates `set-role`
 * against it, so `read`/`write`/`admin` must be declared here. Only `admin`
 * carries admin permissions; `read` and `write` are distinguished by Funnel's
 * own guards (see `#lib/roles`), not by the auth layer. All three reuse the
 * library's default statements so the built-in endpoints keep working.
 */
import { adminAc, userAc } from "better-auth/plugins/admin/access";

/** Account role with no admin permissions (used for both `read` and `write`). */
const viewerRole = userAc;

/** The custom role table handed to the admin plugin. */
export const roles = {
  read: viewerRole,
  write: viewerRole,
  admin: adminAc,
} as const;
