# Prepare an instance for operation

Use this checklist before making a Funnel instance available to its intended users. Funnel is a single long-lived process with a SQLite database and an uploads directory; it is not a stateless service to scale horizontally. See the [deployment model](../../explanation/deployment-model.md).

## Before onboarding

1. Choose persistent, writable paths for the database and uploads. Record their locations and the service account that owns them. See [environment variables](../../reference/environment-variables.md). **Verify:** the recorded paths exist and are writable by the service account.
2. Generate and securely store a unique `FUNNEL_SECRET`. Preserve it with the instance's recovery material: changing or losing it prevents decryption of stored credentials. Do not put it in documentation or issue reports. **Verify:** the effective config contains a secret of at least 32 characters and a protected recovery copy exists.
3. Set `FUNNEL_URL` to the intended external origin before creating the GitHub App. If needed, configure the GitHub Enterprise Server hosts first. **Verify:** the configured origin matches the browser’s intended scheme and host.
4. Restrict access to the fresh instance or configure `FUNNEL_ONBOARDING_TOKEN`. The first account to sign in becomes administrator, so complete onboarding from a trusted environment. **Verify:** untrusted clients cannot reach the wizard, or it prompts for the configured token.
5. If using a proxy, configure HTTPS, trusted forwarded headers and the client address correctly. The proxy must not accept spoofed forwarding headers from untrusted clients. Intake is unauthenticated and has open CORS; rate limits and the honeypot are not a substitute for network access controls. See [the reverse proxy guide](../deploy/reverse-proxy.md) and [security model](../../explanation/security-model.md). **Verify:** HTTPS and the authenticated event stream work through the proxy and direct access to the application port is restricted.

## Before inviting users

1. Complete [GitHub App onboarding](../configure/onboard-github-app.md), select the intended repositories, and check sync status in **Settings → Sync**. **Verify:** the repositories are listed and are not degraded after a successful sync; investigate failures before inviting users.
2. Assign the minimum appropriate [roles](../configure/people-and-roles.md). Review access to the GitHub repositories separately; Funnel writes use the signed-in user's GitHub token. **Verify:** **Settings → People** shows the intended roles and repository access is correct on GitHub.
3. Check `GET /healthz` and `GET /readyz` through the appropriate monitoring path. Readiness can report `503` while the database or migrations are not ready. See the [health reference](../../reference/http-api.md#health-and-readiness). **Verify:** both return HTTP 200 and readiness reports matching migration counts.
4. Configure intake limits for the deployment, and test a submission and a triage decision using non-sensitive data. Ensure uploads and proxy request-size limits suit the intended use. **Verify:** the submission appears in the Inbox and the intended decision completes; a permitted test attachment can be uploaded and downloaded.
5. Set up a protected [backup and restore](backup-and-restore.md) procedure for the database, uploads and secret material, and test recovery on an isolated instance. Record the version and restore outcome. **Verify:** the isolated restore reaches readiness and its data and attachments are available; retain the protected backup and matching secret.
6. Establish a log and alerting procedure using your service manager, then review [upgrade](upgrade.md) and [troubleshooting](troubleshoot.md) procedures with the people responsible for the instance. **Verify:** operators can locate the active logs and know where alerts and recovery instructions are recorded.

Review these checks after changes to the host, proxy, GitHub App, storage or access policy. Never test a restore by overwriting the running production database.
