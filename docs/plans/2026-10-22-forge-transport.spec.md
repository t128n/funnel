# Forge transport, slice 1 — provider layer and labels

## 1. Provider layer

Funnel keeps `octokit` for the modules that have not been ported yet, and adds `forges@0.2.0` as the client for new code. `src/lib/server/forge/providers.server.ts` is the only place that constructs a `forges` provider. It reads the App credentials from `state_github_app` and the hosts from `getConfig().github`, exactly like `app.server.ts` does today.

It exposes:

- `appProvider()` — GitHub App JWT provider, no installation.
- `installationProvider(id)` — provider acting as one installation, cached per id.
- `userProvider(token)` — provider acting as a user token.
- `getInstallationId(owner, repo)` — `GET /repos/{owner}/{repo}/installation`, cached per `owner/name`.
- `repoRef(owner, name)`, `threadRef(repo, kind, number)` — refs carrying `forge: "github"` and the instance host.
- `webOrigin()`, `webUrl(path)` — web links on the configured instance.
- `resetForgeCaches()` — clears the provider and installation-id caches.

The instance is the host of `getConfig().github.url` (`github.com`, `acme.ghe.com`). The API base is `getConfig().github.api_url`. Both github.com and GHES must work without a second code path.

## 2. Label provisioning

`labels.ts` uses the normalised repository operations instead of raw Octokit routes:

- read with `provider.repos.labels(repo)`, mapping `Label.colour` to Funnel's `RepoLabel.color`;
- create with `provider.repos.createLabel(repo, { name, colour, description })`;
- update with `provider.request("PATCH", "/repos/{owner}/{repo}/labels/{name}", { body: { color, description } })`, because `forges` has no update-label operation.

Behaviour is unchanged: case-insensitive matching, create missing labels, patch colour/description drift, leave every non-canonical label alone, never throw from `provisionCanonicalLabels`.

`listRepoLabels` takes a `GitHubProvider` instead of an Octokit client. `sync/worker.ts` obtains the provider with `installationProvider(installationId)` at the call site. `provisionCanonicalLabels` and `provisionRepoLabels` keep their current public signatures, so `reconcile.ts` and `hooks.server.ts` do not change.

## 3. Coexistence and verification

`octokit` stays in `package.json` and `app.server.ts` keeps its current exports. No schema, DTO, route, onboarding or auth change is in this slice. The full suite stays green, and the new modules are tested with a fake provider object rather than GitHub HTTP stubs where possible.
