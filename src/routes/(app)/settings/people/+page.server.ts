import { fail } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import * as v from "valibot";
import { ROLES } from "#lib/roles";
import { getAuth } from "#lib/server/auth/index";
import { requireAdmin } from "#lib/server/auth/guard";
import { db } from "#lib/server/db/index";
import { authAccount, authUser, mirrorUser } from "#lib/server/db/schema";
import type { Actions, PageServerLoad } from "./$types";

/**
 * People & roles (admin only). Lists every Funnel account with its RBAC role and
 * lets an admin change it. The `role` column is owned by the Better Auth admin
 * plugin, so writes go through `auth.api.setRole` (which re-checks the admin
 * role server-side); the guard here is defence in depth.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  const viewer = requireAdmin(locals, url);

  const users = await db.select().from(authUser).orderBy(authUser.createdAt);
  const accounts = await db
    .select({ userId: authAccount.userId, accountId: authAccount.accountId })
    .from(authAccount)
    .where(eq(authAccount.providerId, "github"));
  const accountByUser = new Map(accounts.map((a) => [a.userId, a.accountId]));

  // The mirror may not know a person who has never appeared on an issue, so the
  // forge login is best-effort; `name`/`email` always render.
  const externalIds = [...new Set(accounts.map((a) => a.accountId))];
  const mirrored = externalIds.length
    ? await db
        .select({
          externalId: mirrorUser.externalId,
          login: mirrorUser.login,
        })
        .from(mirrorUser)
    : [];
  const loginByExternalId = new Map(
    mirrored.map((m) => [m.externalId, m.login]),
  );

  return {
    currentUserId: viewer.id,
    users: users.map((user) => {
      const accountId = accountByUser.get(user.id);
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image ?? null,
        role: user.role ?? "read",
        login: accountId ? (loginByExternalId.get(accountId) ?? null) : null,
        createdAt: user.createdAt.getTime(),
      };
    }),
  };
};

const setRoleSchema = v.object({
  userId: v.pipe(v.string(), v.nonEmpty("A user is required")),
  role: v.picklist(ROLES),
});

export const actions: Actions = {
  /** Change one user's role. Rejects demoting the last administrator. */
  setRole: async ({ request, locals }) => {
    requireAdmin(locals, new URL(request.url));

    const form = await request.formData();
    const parsed = v.safeParse(setRoleSchema, {
      userId: String(form.get("userId") ?? ""),
      role: String(form.get("role") ?? ""),
    });
    if (!parsed.success) {
      return fail(400, {
        message: parsed.issues[0]?.message ?? "Invalid role change",
      });
    }
    const { userId, role } = parsed.output;

    const [target] = await db
      .select({ role: authUser.role })
      .from(authUser)
      .where(eq(authUser.id, userId))
      .limit(1);
    if (!target) return fail(404, { message: "User not found" });

    if (target.role === "admin" && role !== "admin") {
      const admins = await db
        .select({ id: authUser.id })
        .from(authUser)
        .where(eq(authUser.role, "admin"));
      if (admins.length <= 1) {
        return fail(409, {
          message: "At least one administrator is required",
        });
      }
    }

    const auth = await getAuth();
    if (!auth) return fail(503, { message: "Authentication is not configured" });

    try {
      await auth.api.setRole({
        body: { userId, role },
        headers: request.headers,
      });
    } catch (error) {
      return fail(502, {
        message:
          error instanceof Error ? error.message : "Could not change the role",
      });
    }
    return { saved: true };
  },
};
