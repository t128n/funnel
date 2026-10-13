import { mock } from "bun:test";
import { generateKeyPairSync } from "node:crypto";

// Runs via `bun test --preload ./tests/setup.ts` before any test file
// loads, so the `$app/env/private` mock below applies to static imports.
// A real RSA key is generated so `@octokit/auth-app` JWT signing works
// offline (tests stub `fetch` for the network itself).
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

mock.module("$app/env/private", () => ({
  FUNNEL_URL: "http://localhost:5173",
  FUNNEL_SECRET: "0123456789abcdef0123456789abcdef",
  FUNNEL_DB: ":memory:",
  GITHUB_APP_ID: "123456",
  GITHUB_APP_PRIVATE_KEY: privateKey,
  GITHUB_CLIENT_ID: "Iv1.0123456789abcdef",
  GITHUB_CLIENT_SECRET: "0123456789abcdef0123456789abcdef01234567",
  LOG_LEVEL: "silent",
}));
