# Environment variables

This page records every environment variable Funnel reads directly, plus the adapter-node variables that affect the deployment shapes documented here, with each one's default, requirement, consumer, and constraints.

Application variables are declared and validated in `src/env.ts` using valibot. The remaining variables are read by the standalone bootstrap (`src/standalone.ts`), the migration runner (`src/lib/server/db/release.ts`), or adapter-node.

| Variable | Required | Default | Purpose | Consumer | Constraints |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `FUNNEL_ENV_FILE` | Optional | Unset | Absolute path to an environment file loaded before validation, migrations, and server startup. Installed services set this to their chosen config file. | `src/standalone.ts` | Absolute path to a readable `.env`-format file. Existing process variables win. Bun's runtime `--env-file` flag does not work inside a compiled executable, so this is the supported installed-service mechanism. |
| `FUNNEL_SECRET` | Yes | — | Signs and encrypts Better Auth state, encrypts stored GitHub App secrets, and encrypts stored OAuth tokens. | `src/lib/server/auth/index.ts`, `src/lib/server/crypto/secrets.ts` | Trimmed string of at least 32 characters. The application does not start without it. |
| `FUNNEL_URL` | Optional | Unset | Public origin used for the OAuth callback base URL and onboarding links. | `src/lib/server/auth/index.ts`, `src/lib/server/onboarding/access.ts` | Valid URL string; HTTP/HTTPS is the supported form. An empty string is treated as unset. When unset, the App's captured base URL or the request origin is used. |
| `FUNNEL_DB` | Optional | `./data/funnel.db`; packaged executable: `<data directory>/funnel.db` | Path to the SQLite database file. | `src/lib/server/db/index.ts`, `src/lib/server/db/release.ts`, `drizzle.config.ts` | Trimmed, non-empty path. `:memory:` is accepted by the migration runner and database layer. |
| `FUNNEL_DATA_DIR` | Optional | `./data` relative to the working directory | Base directory for the database and uploads. | `src/standalone.ts` only | Resolved to an absolute path and created recursively. Supplies `FUNNEL_DB` and `FUNNEL_UPLOAD_DIR` defaults only when those variables are unset. Ignored by `bun run start`. |
| `FUNNEL_UPLOAD_DIR` | Optional | `./data/uploads`; packaged executable: `<data directory>/uploads` | Directory for issue attachment bytes. | `src/lib/server/attachments/store.ts` | Trimmed, non-empty path. The directory is created when an attachment is written. |
| `FUNNEL_UPLOAD_MAX_BYTES` | Optional | `10485760` (10 MiB) | Maximum size of one uploaded attachment. | `src/lib/server/attachments/store.ts`, attachment upload route | Decimal digits only, parsed as a number. Files above the limit are rejected with `413`. Must not exceed `BODY_SIZE_LIMIT` if uploads are to reach the application. |
| `FUNNEL_ONBOARDING_TOKEN` | Optional | Unset | Gates the first-run `/onboarding` wizard. | `src/lib/server/onboarding/access.ts` | Trimmed string; an empty string is treated as unset. Compared in constant time and stored in an HttpOnly cookie for one hour. When unset, anyone who can reach a fresh instance can complete onboarding. |
| `FUNNEL_COMMENT_UI` | Optional | `compact` | Instance default for issue-comment rendering. | `src/lib/server/flags.ts` | `compact` or `bubbles`, case-insensitive. Browsers may override it per browser in Settings → Features. |
| `GITHUB_URL` | Optional | `https://github.com` | Bootstrap GitHub web host, used before onboarding creates an App. | `src/lib/server/config.ts` | Valid URL string; HTTP/HTTPS is the supported form. The onboarding wizard lets you enter a different host, and the host stored with the App takes precedence afterwards. |
| `GITHUB_API_URL` | Optional | `https://api.github.com` | Bootstrap GitHub API base, used before onboarding creates an App. | `src/lib/server/config.ts` | Valid URL string; HTTP/HTTPS is the supported form. For GHES the wizard derives `https://<host>/api/v3`, or you can set this for the pre-onboarding default. |
| `LOG_LEVEL` | Optional | `info` | Pino logging verbosity. | `src/lib/server/log.ts` | One of `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`, case-insensitive. |
| `PORT` | Optional | `3000` | TCP port the adapter-node server listens on. | adapter-node; `src/standalone.ts` healthcheck | Valid TCP port number. The healthcheck always probes `127.0.0.1` on this port. |
| `HOST` | Optional | `0.0.0.0` | Address the adapter-node server binds to. | adapter-node | A bind address. |
| `BODY_SIZE_LIMIT` | Optional | `512K` | Maximum HTTP request body accepted by adapter-node. | adapter-node | Byte-size value such as `25M`. Requests above it are rejected before they reach Funnel, so it must cover attachment uploads, including multipart framing. |
| `PROTOCOL_HEADER` | Optional | Unset | Name of the header carrying the original protocol behind a TLS-terminating proxy. | adapter-node | A header name, for example `x-forwarded-proto`. |
| `HOST_HEADER` | Optional | Unset | Name of the header carrying the original host behind a proxy. | adapter-node | A header name, for example `x-forwarded-host`. |
| `SHUTDOWN_TIMEOUT` | Optional | `30` | Graceful shutdown window in seconds. | adapter-node | Integer number of seconds. |
| `TZ` | Optional | System time zone | Process local time zone. | Runtime; nightly reconciliation schedule | IANA time-zone name, for example `UTC`. Not validated by the application. Controls the local hour used for the 03:00 nightly reconciliation. |
| `FUNNEL_MIGRATIONS_DIR` | Optional | Discovered automatically | Directory containing the committed Drizzle migrations. | `src/lib/server/db/release.ts`, `/readyz` | Absolute path, or a path relative to the working directory, containing `<timestamp>_*/migration.sql`. When unset, the runner probes `import.meta.dir/drizzle`, `<cwd>/drizzle`, and `../../../../drizzle`. |

## Intake helper variables

The optional Windows intake helper (`tools/funnel-intake`) reads the same `FUNNEL_URL` as the server, plus `FUNNEL_HOTKEY` and `FUNNEL_SOURCE`. These override its JSON config file; command-line flags override both. See [Windows intake hotkey](../how-to/integrate/windows-intake-hotkey.md).

## Loading and precedence

Bun loads a `.env` file from the working directory automatically. Variables already present in the process environment take precedence over values in that file.

The standalone bootstrap additionally loads `FUNNEL_ENV_FILE` before anything else. The native service definitions set this to the configured config file, so an installation can keep its configuration outside the data directory. `funnel setup` writes that file from the embedded `.env.example`, preserves an existing `FUNNEL_SECRET`, and backs up a replaced file.

## Packaged executable defaults

The standalone bootstrap applies data-directory defaults in this order:

1. Resolve `FUNNEL_DATA_DIR`, or `<working directory>/data` when it is unset, to an absolute path.
2. Create that directory recursively.
3. Set `FUNNEL_DB` to `<data directory>/funnel.db` if it is unset.
4. Set `FUNNEL_UPLOAD_DIR` to `<data directory>/uploads` if it is unset.

Explicit values for `FUNNEL_DB` and `FUNNEL_UPLOAD_DIR` win, including relative paths. These defaults belong to the packaged executable, not to `bun ./build/index.js`; the latter uses the `src/env.ts` defaults relative to its working directory.

## Upload size

Attachment uploads are subject to two independent limits. `FUNNEL_UPLOAD_MAX_BYTES` is enforced by Funnel after the request is parsed, and `BODY_SIZE_LIMIT` is enforced by adapter-node before the request reaches Funnel. A deployment that enables the attachment dropbox needs `BODY_SIZE_LIMIT` to be at least as large as `FUNNEL_UPLOAD_MAX_BYTES`, with room for the multipart envelope.

## Related

- [Command-line interface](./cli.md)
- [Build tasks](./build-tasks.md)
- [Settings](./settings.md)
- [Roles and permissions](./roles-and-permissions.md)
- [Design](../DESIGN.md)
