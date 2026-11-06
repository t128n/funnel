# Security and access

Funnel has three server-enforced roles, one GitHub identity per kind of work, and encrypted credentials at rest. The browser mirrors guards cosmetically; the server is the enforcement point.

## Roles

[[src/lib/roles.ts]] defines a strict hierarchy: `read` < `write` < `admin`. An absent or unrecognized role degrades to `read`, the safest default.

- `read` can browse every cockpit view and the realtime stream, and manage only their own account.
- `write` adds issue mutations, comments, labels, work notes, attachments, intake triage, plans, delays, and local triage state.
- `admin` adds instance settings and people management.

The role lives on `auth_user.role`, managed by the Better Auth admin plugin. [[src/lib/server/auth/guard.ts#requireUser]] redirects an unauthenticated visitor to `/login` with a return path, [[src/lib/server/auth/guard.ts#requireRole]] returns `403` for an authenticated visitor below the minimum, and [[src/lib/server/auth/guard.ts#requireAdmin]] is the admin shorthand.

API routes use the equivalent guard in [[src/lib/server/http/session.ts#apiRole]], which returns a ready `401` or `403` response. The settings layout requires `admin` for every section except Account, Appearance, and Features, so a direct URL cannot bypass the navigation filter.

## Sessions and the first admin

[[src/lib/server/auth/index.ts#getAuth]] builds the Better Auth instance lazily. It returns `null` until onboarding has stored App credentials, which is exactly the signal behind the first-run gate.

New accounts default to `read`. [[src/lib/server/auth/index.ts#promoteFirstAdmin]] promotes the first account to sign in, so a fresh instance always has an owner. The check is a no-op once any admin exists.

The session idle lifetime comes from `session.idle_days` (30 days by default) when the auth instance is built. Changing that setting affects sessions after the instance is rebuilt or the process restarts, not instantly. A failed build is not memoised, so a transient error or a newly saved App can succeed on the next call; onboarding resets the cache explicitly.

## GitHub authority

Funnel does not reimplement per-repository permissions. GitHub enforces them for every write.

- **Reads and background sync** use the GitHub App installation token. The bot can be granted issue access without requiring a person to be signed in.
- **User-initiated writes** use the signed-in person's token. [[src/lib/server/auth/index.ts#getUserAccessToken]] resolves it, refreshing a nearly expired token through Better Auth and persisting the rotated token encrypted. [[src/lib/server/issues/http.ts#authenticateWrite]] combines the `write` role with that token.
- **Self-healing housekeeping** such as label provisioning and conflict repair uses the installation token, because it is not a human edit.

Every write also checks that the target repository is configured. That prevents triage from targeting an unmapped repository, while GitHub remains the final authority on the person's real access.

## Encrypted credentials

`FUNNEL_SECRET` is mandatory and at least 32 characters. It signs sessions and derives the key used to encrypt the GitHub App's client secret and RSA private key.

[[src/lib/server/crypto/secrets.ts#encryptSecret]] uses AES-256-GCM with a scrypt-derived key and an `iv:tag:ciphertext` envelope. [[src/lib/server/crypto/secrets.ts#decryptSecret]] rejects a tampered or malformed envelope. Credentials live in the single `state_github_app` row; there are no credential environment variables.

Better Auth is configured with `encryptOAuthTokens`, so user access and refresh tokens are also encrypted at rest in `auth_account`. A stolen database file alone cannot recover the App key or the user tokens without the secret.

A database restored without its original secret still contains the rows but cannot decrypt them. Backup the secret with the database and do not rotate it casually on a live instance.

## First-run onboarding

The GitHub App is created through the App Manifest Flow, and its credentials are stored encrypted.

[[src/lib/server/github/manifest.ts#buildManifest]] requests only issues write, metadata read, contents read, pull requests read, and checks read. It registers no events and no webhook, so GitHub never needs an inbound connection to the server.

The callback validates a sealed state cookie before exchanging the temporary code. [[src/lib/server/github/manifest-flow.server.ts]] performs the exchange, and [[src/lib/server/github/credentials.ts#saveManifestCredentials]] stores the result. A failure redirects to a generic error rather than exposing the provider response.

When `FUNNEL_ONBOARDING_TOKEN` is set, [[src/lib/server/onboarding/access.ts#acceptOnboardingToken]] gates the wizard with a constant-time comparison and a one-hour HttpOnly cookie. When it is unset, the wizard is open until the App exists; the first-run gate then closes it automatically.

## Public surfaces

Only intake, sign-in, onboarding, and health probes are public; everything else needs a session.

The first-run gate exempts only the wizard, health probes, SvelteKit's `/_app` bundle, `/api/auth/*`, and asset-looking paths. An unconfigured instance therefore has no reachable cockpit.

Responses carry `X-Robots-Tag: noindex, nofollow`. Unexpected errors are logged with a request id and return generic copy, so upstream text and internals stay server-side.

## Settings validation

A settings save is a patch, not a blind write. [[src/lib/server/settings/apply.ts#saveSettings]] parses the patch, merges it onto current settings, validates the composed config with the same rules as startup, and persists the result in one transaction through [[src/lib/server/settings/store.ts#writeSettings]].

After a successful save it drops the config cache, wakes the sync scheduler so repository and interval changes take effect, and publishes a `settings` event. A rejected save returns field-level issues; it never leaves a partially applied configuration.

## Tests

RBAC, first-admin bootstrap, auth, and GitHub App settings are covered by [[tests/rbac.test.ts]], [[src/lib/server/auth/auth.test.ts]], and [[tests/settings-github-app.test.ts]].

## Related

The architecture, workflow, and operations docs cover the systems these guarantees protect.

- [[architecture]] — the request pipeline and cached singletons.
- [[workflow]] — which writes are group-aware and which tolerate eventual consistency.
- [[operations]] — secret handling in backup and restore.
