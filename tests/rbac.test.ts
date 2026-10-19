import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { hasRole, normalizeRole } from "#lib/roles";
import { promoteFirstAdmin } from "#lib/server/auth/index";
import { db } from "#lib/server/db/index";
import { authUser } from "#lib/server/db/schema";
import { apiRole, apiSession } from "#lib/server/http/session";

// RBAC: the role ranking, the API guards, and the first-admin bootstrap.

describe("role ranking", () => {
  test("normalizeRole defaults unknown values to read", () => {
    expect(normalizeRole("admin")).toBe("admin");
    expect(normalizeRole("write")).toBe("write");
    expect(normalizeRole(null)).toBe("read");
    expect(normalizeRole(undefined)).toBe("read");
    expect(normalizeRole("root")).toBe("read");
  });

  test("hasRole compares against the minimum", () => {
    expect(hasRole("read", "read")).toBe(true);
    expect(hasRole("read", "write")).toBe(false);
    expect(hasRole("write", "write")).toBe(true);
    expect(hasRole("write", "admin")).toBe(false);
    expect(hasRole("admin", "admin")).toBe(true);
    // Null/unknown roles are treated as read.
    expect(hasRole(null, "write")).toBe(false);
    expect(hasRole(null, "read")).toBe(true);
  });
});

describe("apiRole", () => {
  const locals = (user: unknown) => ({ user, session: null }) as App.Locals;

  test("401 without a session", () => {
    const res = apiRole(locals(null), "read");
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(401);
  });

  test("403 when the role is too low", () => {
    const res = apiRole(locals({ id: "u", role: "read" }), "write");
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(403);
  });

  test("returns the user id when the role satisfies the minimum", () => {
    expect(apiRole(locals({ id: "u", role: "write" }), "write")).toBe("u");
    expect(apiRole(locals({ id: "u", role: "admin" }), "admin")).toBe("u");
  });

  test("a missing role behaves as read", () => {
    expect(apiRole(locals({ id: "u" }), "read")).toBe("u");
    expect(apiRole(locals({ id: "u" }), "write")).toBeInstanceOf(Response);
  });

  test("apiSession still accepts any signed-in user", () => {
    expect(apiSession(locals({ id: "u" }))).toBe("u");
    expect(apiSession(locals(null))).toBeInstanceOf(Response);
  });
});

describe("first-admin bootstrap", () => {
  async function seed(id: string): Promise<void> {
    const now = new Date();
    await db
      .insert(authUser)
      .values({
        id,
        name: id,
        email: `${id}@example.com`,
        emailVerified: true,
        role: "read",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
  }

  async function roleOf(id: string): Promise<string | null> {
    const [row] = await db
      .select({ role: authUser.role })
      .from(authUser)
      .where(eq(authUser.id, id));
    return row?.role ?? null;
  }

  afterEach(async () => {
    await db.delete(authUser).where(eq(authUser.role, "admin"));
    await db.delete(authUser).where(eq(authUser.role, "read"));
  });

  test("promotes the first account, leaves later ones at read", async () => {
    await seed("bootstrap_a");
    await promoteFirstAdmin("bootstrap_a");
    expect(await roleOf("bootstrap_a")).toBe("admin");

    await seed("bootstrap_b");
    await promoteFirstAdmin("bootstrap_b");
    expect(await roleOf("bootstrap_b")).toBe("read");
  });
});
