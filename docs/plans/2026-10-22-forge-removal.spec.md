# Forge transport, slice 5 — passthrough and Octokit removal

## 1. Passthrough

`api-passthrough.server.ts` takes a `GitHubProvider` instead of an Octokit client. It sends `provider.request("GET", upstreamPath, { query, headers })` and reads `status`, `data` and `headers`. Success headers are read from the `Headers` object. Error handling keeps the current contract: 304 revalidation from cache, a 404 with the "Not synced" fallback, and forwarding of other statuses with the upstream message. `ForgeApiError.body` supplies the error body in place of `error.response.data`; rate-limit headers may be absent and are simply omitted.

## 2. Read routes

Every GET handler under `src/routes/api/repos/**` obtains its client with `forge.installationProvider(installationId)`, its installation id with `forge.getInstallationId`, and its fallback URL with `forge.webUrl`. The users route uses `forge.appProvider()`. `installationErrorResponse` moves to the forge provider module, or stays as a small helper that uses `forge.webUrl`.

## 3. Remove Octokit

`app.server.ts` and `app.test.ts` are deleted. `resetAppCache()` becomes `forge.resetCaches()` in onboarding, settings and tests. `manifest-flow.server.ts` uses `forge.appProvider()` for the installation listing. `sync/worker.ts` and `sync/reconcile.ts` import `getInstallationId` from the forge provider. `octokit` is removed from `package.json`, and `tests/github-app.ts` no longer mentions `@octokit/auth-app` (the RSA key stays).

## 4. Verification

No `octokit` import remains. The full suite is green, `bun run check` is clean, and the HTTP routes keep their request/response contracts.
