import { describe, expect, test } from "bun:test";
import { db } from "#lib/server/db/index.js";
import { auth } from "./index.js";

describe("auth smoke", () => {
  test("github provider configured with client id", () => {
    const providers = auth.options.socialProviders;
    expect(providers?.github?.clientId).toBe("Iv1.0123456789abcdef");
  });

  test("sign-in stores oauth state and returns github url", async () => {
    // No migration runner yet, so create the touched table directly.
    db.$client.run(
      "CREATE TABLE IF NOT EXISTS verification (" +
        "id TEXT PRIMARY KEY, identifier TEXT NOT NULL, value TEXT NOT NULL, " +
        "expiresAt INTEGER NOT NULL, createdAt INTEGER, updatedAt INTEGER)",
    );
    const res = await auth.api.signInSocial({
      body: { provider: "github", callbackURL: "/" },
    });
    expect(res.url).toContain("github.com");
    expect(res.url).toContain("client_id=Iv1.0123456789abcdef");
    const rows = db.$client
      .query("SELECT * FROM verification WHERE identifier LIKE 'auth-state:%'")
      .all();
    expect(rows.length).toBe(1);
  });

  test("session expiry matches 30-day idle default", () => {
    expect(auth.options.session?.expiresIn).toBe(60 * 60 * 24 * 30);
  });
});
