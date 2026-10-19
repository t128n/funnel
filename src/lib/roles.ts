/**
 * Funnel's instance-wide role-based access control (RBAC).
 *
 * Three roles, ranked in a strict hierarchy:
 *
 *   read  <  write  <  admin
 *
 * - `read` views the cockpit (issues, board, inbox, attention) and the realtime
 *   stream, and manages only their own account.
 * - `write` adds every mutation: issues, comments, labels, work notes,
 *   attachments, and intake triage.
 * - `admin` adds instance settings and people management.
 *
 * The value lives on `auth_user.role`, declared by the Better Auth admin plugin
 * (see `#lib/server/auth/index`). This module is deliberately dependency-free so
 * both the server guards and the client UI can share one source of truth for the
 * ranking. An absent or unrecognized role degrades to `read`, the safest default.
 */

/** Every role, weakest to strongest. */
export const ROLES = ["read", "write", "admin"] as const;

export type Role = (typeof ROLES)[number];

/** Numeric rank; higher satisfies a lower-or-equal minimum. */
const RANK: Record<Role, number> = { read: 0, write: 1, admin: 2 };

/** Whether a raw value is one of the known roles. */
export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Coerce a raw role (possibly `null`/unknown) to a known role. */
export function normalizeRole(value: unknown): Role {
  return isRole(value) ? value : "read";
}

/** Whether `role` meets or exceeds `min`. */
export function hasRole(role: unknown, min: Role): boolean {
  return RANK[normalizeRole(role)] >= RANK[min];
}

/** Whether `role` may mutate issues and Funnel-local records. */
export function canWrite(role: unknown): boolean {
  return hasRole(role, "write");
}

/** Whether `role` may manage instance settings and people. */
export function canAdmin(role: unknown): boolean {
  return hasRole(role, "admin");
}
