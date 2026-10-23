# The security model

Funnel is a private, single-instance cockpit that delegates identity to GitHub OAuth, encrypts every secret it stores at rest, and treats its network boundary — not CORS — as the real limit of its public intake surface.

## Sessions and identity

Sign-in is GitHub OAuth via Better Auth. `createAuth()` in `src/lib/server/auth/index.ts` registers a `github` social provider with `clientId`/`clientSecret` taken from the stored GitHub App, and requests exactly two scopes: `read:user` to identify who signed in, and `repo` to cover issue reads and writes on private repositories. There are no administrative or workflow scopes. The OAuth callback is registered on GitHub as `{baseUrl}/api/auth/callback/github`, where `baseUrl` is `FUNNEL_URL` when it is set and otherwise the public origin captured when the App was created.

Returning `null` from `createAuth()` while no App exists is a security posture, not just a startup state. A fresh instance has no way to sign in, so the first-run gate in `src/hooks.server.ts` sends every non-exempt request to `/onboarding`; the wizard is the only reachable user-facing surface until an App exists. The onboarding wizard can itself be locked with an optional `FUNNEL_ONBOARDING_TOKEN`; when set, the token is compared in constant time and stored in an `HttpOnly`, `SameSite=Lax` cookie (`src/lib/server/onboarding/access.ts`). When unset, the wizard is open until the App is created, after which the gate closes it automatically.

The session itself is a cookie validated per request. `hooks.server.ts` resolves it once into `event.locals.session` and `event.locals.user` so load functions and actions do not re-resolve it, and `getSession()` provides the same lookup for API routes. Session lifetime is `session.idle_days` (default 30), read from instance settings; the source comment notes that because Better Auth builds its options once per build, a change made in the UI applies to sessions created after the auth instance is rebuilt or the process restarts.

## User tokens at rest

Every GitHub write runs with the signed-in user's token, not a shared privileged token. That token is a user-to-server OAuth token obtained through the App, and it is sensitive: it can act as the user within their repository permissions. Funnel therefore does not store it in plaintext.

The auth instance sets `encryptOAuthTokens: true`. Better Auth then encrypts `accessToken`/`refreshToken` on write and decrypts them on read, and Funnel derives these operations' key from `FUNNEL_SECRET`. The comment records the cipher: XChaCha20-Poly1305 with a SHA-256-derived key — an AEAD, so the ciphertext is authenticated as well as confidential. Tokens live in `auth_account`; the schema warns that tokens "must be encrypted at rest with a key derived from FUNNEL_SECRET before they reach this layer".

Access tokens do not last forever. `getUserAccessToken()` is the supported way to obtain one: it looks up the account row and calls Better Auth's `getAccessToken`, which, when a token is within five seconds of expiry, refreshes it through the provider and persists the rotated tokens (still encrypted). The comment explicitly warns callers not to read `auth_account.accessToken` directly, because it now holds ciphertext. Because rotation is automatic, the expiry of a user's GitHub token is invisible to the cockpit as long as the refresh token remains valid.

The design consequence is that Funnel's own authorisation for GitHub actions is mostly *delegated*: a user who cannot write to a repository cannot make Funnel do it either, because GitHub rejects their token. Funnel adds only a configured-repository check on top.

## GitHub App secrets at rest

The App is created through GitHub's App Manifest Flow during onboarding. The conversion call returns `client_secret`, an optional `webhook_secret`, and an RSA private key (`pem`); Funnel stores all of them in the single `state_github_app` row, encrypted. There are no credential environment variables — the row is the source of truth.

`src/lib/server/crypto/secrets.ts` implements the encryption: **AES-256-GCM**, another AEAD, with a key derived from `FUNNEL_SECRET` via scrypt and a fixed salt. The comment defends the fixed salt explicitly — the secret is high-entropy and this is not password storage — and the algorithm is derived once per process. Each value is wrapped in a self-describing `iv:tag:ciphertext` envelope, all base64, so the ciphertext is authenticated and a tampered envelope fails loudly on decrypt.

`FUNNEL_SECRET` is mandatory and validated in `src/env.ts` to be at least 32 characters. That single secret underpins both encryption schemes — the App secrets directly, and the OAuth token encryption through Better Auth — so a stolen database file *on its own* cannot recover any stored secret. It does not protect against an attacker who also holds the environment, which is why the deployment guidance is to keep the data directory and the environment together but the database file not useful by itself.

## Roles, enforced server-side

Funnel ships three instance roles, ranked `read < write < admin` (`src/lib/roles.ts`):

- `read` views the cockpit — issues, board, inbox, attention — and the realtime stream, and manages only their own account.
- `write` adds every mutation: issues, comments, labels, work notes, attachments, and intake triage.
- `admin` adds instance settings and people management.

The role lives on `auth_user.role`, managed through the Better Auth admin plugin, whose access-control table is defined in `src/lib/server/auth/access.ts`: only `admin` carries admin permissions, while `read` and `write` both map to the library's non-admin role and are distinguished by Funnel's own guards. `normalizeRole` degrades an absent or unrecognised value to `read`, the safest default.

Enforcement is server-side and is the single point of truth; the UI only mirrors it cosmetically. `src/lib/server/auth/guard.ts` provides `requireUser`, `requireRole`, and `requireAdmin` for page loads and form actions: an unauthenticated visitor is redirected to `/login` with a return path, while an authenticated visitor missing the role gets an explicit `403` rather than a redirect. `src/lib/server/http/session.ts` provides `apiSession` and `apiRole` for JSON endpoints, returning ready `401`/`403` responses. Both paths run the same `hasRole` comparison.

Two bootstrap rules keep the instance governable. The first account to sign in is promoted to `admin` by `promoteFirstAdmin`, because the admin plugin otherwise assigns every new user the `read` default and a fresh instance would have no way to promote anyone; the comment accepts the tiny race between two simultaneous first sign-ins on a single-instance SQLite deployment. At the other end, at least one admin is always required, so the last one cannot be demoted.

## The public surface

Unauthenticated access is limited to a handful of deliberate surfaces:

- **`/healthz` and `/readyz`** — probes that expose no cockpit data.
- **`/login`** — the sign-in page once an App exists.
- **`/api/auth/*`** — Better Auth's endpoints, including the OAuth callback (`/api/auth/callback/github`); they answer `503` while no App is configured.
- **`/intake`** — the JavaScript-free submission form once an App exists.
- **`POST /api/intake`** (and its `OPTIONS` preflight) — the public JSON intake endpoint once an App exists.

`/onboarding` is a special case: reachable while the instance is unconfigured, and optionally token-gated. The first-run gate sends every other non-exempt path there.

The intake endpoint is deliberately **open CORS**: `OPEN_CORS` sets `Access-Control-Allow-Origin: *`, allows `POST`/`OPTIONS` and the `Content-Type` header, and — critically — no credentials, so a browser on another origin can call it but cannot attach Funnel cookies. The comment is candid that CORS is not the security boundary here: "Funnel is expected to sit behind enterprise network segmentation, which is the actual access boundary — CORS here only unblocks the browser preflight." The CORS policy allowlists only the `Content-Type` request header; the handler parses the body with `request.json()` and does not itself reject other media types.

The intake schema bounds what a submission may carry: a title up to 256 characters and a body up to 65,536 characters. The endpoint is unauthenticated and unrate-limited by Funnel itself, which is the main reason the network boundary matters — see *What is not protected* below.

## Uploads

The attachment dropbox writes untrusted bytes to disk, so the storage layer treats the client filename as hostile (`src/lib/server/attachments/store.ts`):

- **The on-disk path is server-generated.** `saveAttachment` builds `<yyyy>/<mm>/<uuid>` and never derives any part of it from the client filename, so a malicious name cannot escape the upload directory.
- **A containment check backs that up.** `absolutePath` resolves the stored path against the upload root and rejects anything that is not the root or beneath it, guarding against a future path-handling mistake.
- **The display name is sanitised.** `sanitizeFilename` strips control characters and `/`/`\`, trims, caps at 255 characters, and falls back to `"attachment"` when nothing remains — safe to store, echo in a header, and show in the UI.
- **Size is capped.** `FUNNEL_UPLOAD_MAX_BYTES` bounds a single upload (default 10 MiB), and deployment guidance notes `BODY_SIZE_LIMIT` must be raised to match or uploads are rejected at the door.

Download is the other half. `GET /api/attachments/[id]` requires at least the `read` role, then serves the bytes with `Content-Disposition: attachment` (an RFC 6266 value with an ASCII fallback plus a UTF-8 `filename*`), `X-Content-Type-Options: nosniff`, and `Cache-Control: private, max-age=0, must-revalidate`. The stored MIME type is passed through but never trusted to render inline, and `nosniff` stops a browser from second-guessing it; the comment says the type is untrusted and "files are downloads". Deletion requires the `write` role.

## Markdown rendering

Issue bodies, comments, and — importantly — anonymous intake submissions are all untrusted Markdown. Rendering happens on the server and the client only ever receives a finished, sanitised HTML string to inject with Svelte's `{@html}` (`src/lib/server/markdown/render.ts`).

The renderer parses GitHub-Flavored Markdown and *reparses embedded raw HTML into real elements* with `rawHtml: true`, precisely so the sanitiser can vet it rather than letting raw HTML pass through verbatim. `sanitize-html` then applies a GitHub-style allowlist: a fixed set of tags, a per-tag attribute allowlist, and only `text-align` (with four legal values) permitted as inline style. `on*` handlers and arbitrary `style` are never listed, so they are stripped. Allowed URL schemes are `http`, `https`, and `mailto`, protocol-relative URLs are refused, and external links are rewritten to `rel="noopener noreferrer" target="_blank"` so a link cannot reach back into the opener. This same sanitiser is what makes the invisible `<!-- funnel_metadata -->` envelope genuinely invisible: comments are not in the tag allowlist.

## Staying out of search indexes

Funnel assumes it is a private instance and biases hard toward not being indexed. `robots.txt` disallows all crawling, pages carry a matching `<meta name="robots">`, and `withCrawlHeaders` in `hooks.server.ts` adds `X-Robots-Tag: noindex, nofollow` to every response. The comment explains the belt-and-braces choice: the header is "the one signal that can't be stripped by a page that renders outside the app template". Running a public instance would mean removing all three deliberately.

## Errors and correlation ids

Every request gets a UUID in `event.locals.requestId`, created in the `handle` hook. `handleError` logs structured fields — request id, method, path, error kind, status — and the full stack for *unexpected* failures, at `error` level. The client never sees that message: an unknown error returns generic copy ("Something went wrong on our end. Please try again.") plus the correlation id, so an operator can find the matching log line without the response leaking upstream text or internals. Expected errors — a `404` from a load, an explicit `error(403)` — are logged at `warn` and their safe status/message is inherited.

The same restraint appears in the write layer: `Outcome` failures carry GitHub's own status where the failure came from upstream and otherwise `400`/`404`/`502`, and the message is a human-readable string rather than a stack.

## The real intake boundary

Funnel is explicitly single-instance. It owns a SQLite file and an in-memory SSE bus, and the deployment guidance forbids running multiple replicas against one volume. This has a security meaning as well as an operational one: the honest boundary for the public intake surface is the deployment's own network placement — a private network, a VPN, or a reverse proxy — not anything in the application. The code says so repeatedly:

- The CORS comment: segmentation "is the actual access boundary".
- The intake endpoint comment: open CORS is "gated in practice by the instance's network segmentation".
- Deployment guidance: mount one data volume, do not scale horizontally, terminate TLS in front.

So the intended posture is: put Funnel where only trusted people and trusted reporting systems can reach it, and let the open intake endpoint be open *within* that boundary. That is a coherent design for an internal, self-hosted tool — and a dangerous one if the instance is exposed to the public internet unchanged.

## What is not protected

Being explicit about the gaps is part of the model:

- **No per-repository Funnel ACL.** Funnel's membership is instance-wide. Any signed-in user can *read* every mirrored repository's issues, work notes, and attachments, and the mutation guard checks only that a repository is configured, not that the user may touch it. For writes, GitHub's per-repository permissions still apply because the user's own token is used — but reads are not additionally partitioned, and any `write`-role user can attempt a write against any configured repository, relying on GitHub to refuse it.
- **No authorisation on attachment downloads beyond `read`.** Anyone signed in at the `read` level can fetch any attachment by id; the dropbox is not scoped per repo or per user.
- **Intake has no authentication, no rate limiting, and no abuse controls** in the application. The only bounds are the title/body length caps and the network boundary itself.
- **The `repo` scope is broad.** Funnel cannot ask for less and still write issues on private repositories; a compromised session token carries that scope until it expires or the user revokes the App.
- **The first-run wizard is open when `FUNNEL_ONBOARDING_TOKEN` is unset.** On a fresh instance reachable by an untrusted party, anyone could claim the App configuration; the token is the mitigation, and it is optional.
- **`FUNNEL_SECRET` is the whole ballgame.** It protects App secrets and OAuth tokens; if it leaks alongside the database, every stored secret is recoverable.

## Trade-offs

The model optimises for a self-hosted, single-organisation deployment and accepts several explicit compromises:

- **Delegating to GitHub keeps Funnel simple.** Using the user's token means GitHub enforces repository permissions natively and Funnel never invents its own per-repo ACL. The cost is that Funnel's read side is coarser than its write side.
- **Open CORS plus open intake is convenient and blunt.** It makes browser-based reporting from any origin trivial, at the price of relying entirely on network placement — no application-layer defence in depth for the public surface.
- **One secret, two ciphers.** A single `FUNNEL_SECRET` underlies both AES-256-GCM (App secrets) and Better Auth's XChaCha20-Poly1305 (OAuth tokens). One thing to protect, and one thing whose loss is catastrophic.
- **Encryption at rest only.** Secrets are protected against a stolen database file, not against a compromised process or host; the token is decrypted for every write.
- **No indexing, not no exposure.** `noindex` keeps Funnel out of search engines; it does nothing to stop someone who knows the URL. It is a default-private posture, not an access control.
- **Generic errors trade debuggability for non-disclosure.** Clients see a correlation id instead of the cause; operators pay for that by needing the logs.

## Related

- [The workflow model](workflow-model.md) — what a `write`-role user can change, and how.
- [The intake lifecycle](intake-lifecycle.md) — the public capture surface this model constrains.
- [Architecture](architecture.md) — the single process and its in-memory bus.
- [Roles and permissions reference](../reference/roles-and-permissions.md) — the `read`/`write`/`admin` split.
- [Environment variables reference](../reference/environment-variables.md) — `FUNNEL_SECRET`, `FUNNEL_ONBOARDING_TOKEN`, and the rest.
- [Onboard the GitHub App](../how-to/configure/onboard-github-app.md) — the manifest flow and its stored secrets.
- [Deploy with Docker](../how-to/deploy/docker.md) — network segmentation, single-instance, and TLS.
